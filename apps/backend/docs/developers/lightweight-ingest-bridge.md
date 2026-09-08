---
description: >-
  Run a lightweight document ingest for any course with the HTTP ingest bridge
  (bridge.py) and the RabbitMQ worker — no full Flask backend required.
layout:
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
---

# Lightweight Ingest via the HTTP Bridge

`ai_ta_backend/rabbitmq/bridge.py` is a minimal HTTP front door for the ingest
pipeline. It exposes a single `POST /ingest` endpoint that mirrors the main
backend's `/ingest` route: it inserts a `documents_in_progress` row and
publishes the job to RabbitMQ, where the ingest worker (`worker.py`) picks it
up. That means you can drive a full ingest for **any course** — bulk document
loads, migrations, re-ingests — without deploying the entire Flask backend.

This is the same endpoint the Crawlee service targets via `INGEST_URL`, so
anything you can crawl-ingest you can also ingest by hand through the bridge.

## When to use it

* Bulk-ingesting an existing corpus (e.g. thousands of PDFs already sitting in
  S3) into a course.
* Re-ingesting documents after a pipeline or schema change.
* Migration scripts that need to queue ingest jobs from outside the main
  deployment.
* Any environment where you want the ingest path up quickly: broker + database
  \+ worker + bridge is the whole footprint.

## How it fits together

```
your script / Crawlee ──POST /ingest──▶ bridge.py ──▶ documents_in_progress row (Postgres)
                                                  └─▶ RabbitMQ queue ──▶ worker.py ──▶ per-doc ingest subprocess
```

The worker runs each document in a time-boxed subprocess (default 300s,
`INGEST_SUBPROCESS_TIMEOUT`), so a hung or segfaulting PDF/OCR job kills only
that document's child process — the queue keeps draining.

Per-course infrastructure (S3 bucket, vector store, embeddings, documents DB)
is resolved by the worker at job time from the course's
[external connections config](external-connections-config.md), with the
host defaults used for courses that have none.

## Running the bridge

The bridge runs from the **same image as the worker** (same build context,
`ai_ta_backend/rabbitmq/Dockerfile`); the bridge service simply overrides the
command:

```bash
python bridge.py   # serves on 0.0.0.0:8001
```

Environment (identical to the worker):

| Variable | Purpose |
| --- | --- |
| `RABBITMQ_URL` | AMQP broker URL (default `amqp://guest:guest@localhost:5672`) |
| `RABBITMQ_QUEUE` | Queue name (default `uiuc-chat`) |
| `RABBITMQ_SSL` | Set truthy for TLS brokers (e.g. Amazon MQ) |
| `POSTGRES_ENDPOINT` / `POSTGRES_PORT` / `POSTGRES_DATABASE` / `POSTGRES_USERNAME` / `POSTGRES_PASSWORD` | Documents DB for the `documents_in_progress` status rows |
| `INGEST_API_KEY` | Optional bearer token. If set, callers must send `Authorization: Bearer <key>`. Strongly recommended for anything internet-facing; if unset the endpoint is open. |

For local experiments, `ai_ta_backend/rabbitmq/docker-compose.yml` brings up
RabbitMQ, Postgres, and the worker container in one network.

Health check: `GET /api/healthcheck` returns `{"status": "OK"}`.

## Queueing a document

`POST /ingest` accepts the same JSON payload as the backend `/ingest` route.
`course_name` is required; provide the document as `s3_paths`, `url`, or
`content`.

```bash
curl -X POST "http://<bridge-host>:8001/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -d '{
    "course_name": "my-course",
    "readable_filename": "lecture-01.pdf",
    "s3_paths": "courses/my-course/lecture-01.pdf"
  }'
```

A successful call returns the queued task id:

```json
{ "outcome": "Queued Ingest task", "task_id": "..." }
```

Common payload fields:

| Field | Notes |
| --- | --- |
| `course_name` | Required. The course/project to ingest into. |
| `readable_filename` | Display name shown in the course's documents view. Defaults to empty. |
| `s3_paths` | A single S3 key (string) or a list of keys, in the bucket the course's connection config points at. |
| `url` / `base_url` | For web documents (this is what Crawlee sends). |
| `content` | Raw text content to ingest directly. |
| `groups` | Optional document groups to attach. |

## Bulk ingest pattern

For a large corpus, loop over your S3 keys and POST one job per document. The
bridge only *queues* work — each request is fast — and the worker paces itself
via RabbitMQ prefetch, so it is safe to enqueue thousands of jobs up front:

```bash
aws s3 ls "s3://my-bucket/courses/my-course/" --recursive \
  | awk '{print $4}' \
  | while read -r key; do
      curl -s -X POST "http://<bridge-host>:8001/ingest" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $INGEST_API_KEY" \
        -d "{\"course_name\": \"my-course\", \"readable_filename\": \"$(basename "$key")\", \"s3_paths\": \"$key\"}"
    done
```

Track progress via the `documents_in_progress` table (rows are removed as jobs
complete) or the course's documents view in the frontend. Failed jobs land in
the `documents_failed` table with the error message from the worker, including
timeouts and crashes from the per-document subprocess watchdog.
