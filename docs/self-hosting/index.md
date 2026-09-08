# Self-Hosting

Illinois Chat is fully open source (Apache 2.0) and ships with a Docker Compose stack that runs the entire platform — application services and all required infrastructure — on your own hardware.

## Requirements

- Docker v24+ and Docker Compose v2
- Git
- Python 3.10/3.11 and Node.js 20.19+/22.12+ only if you plan to [develop locally](../developers/dev-setup.md)

## Quickstart

```bash
# 1. Clone the monorepo
git clone https://github.com/Center-for-AI-Innovation/Illinois-Chat.git
cd Illinois-Chat

# 2. Start everything
bash infra/scripts/start-all.sh
```

The script creates a repository-root `.env` from `.env.template` if needed, starts the frontend, backend, ingest worker, Crawlee, Postgres, Redis, RabbitMQ, MinIO, Qdrant, and Keycloak, then initializes the database and the Qdrant collection.

Open **http://localhost:3000** and create your first project.

!!! tip "No OpenAI key required"
    OpenAI is not required for local self-hosting. Configure `EMBEDDING_MODEL` and `EMBEDDING_API_BASE` for any OpenAI-compatible embedding endpoint (the default expects Qwen3-Embedding-8B, 4096-dimensional vectors), and point chat at Ollama, vLLM, or another provider. See [Environment Variables](environment-variables.md).

## What's running

| Service | Port | Description |
| --- | --- | --- |
| Frontend | 3000 | Next.js web application |
| Backend API | 8000 | Flask API |
| Crawlee | 3345 | Web-crawling service |
| Keycloak | 8080 | Authentication |
| PostgreSQL | 5432 | Relational database |
| MinIO API | 10000 | Object storage (S3-compatible) |
| MinIO Console | 9001 | Object-storage management UI |
| Qdrant | 6333 | Vector database |
| RabbitMQ Management | 15672 | Ingest-queue management |

!!! warning "MinIO ports"
    Use the MinIO **API** endpoint (`http://localhost:10000`) for uploads and presigned URLs — never the console port (`9001`).

## Common commands

```bash
# reset local Docker data before starting
bash infra/scripts/start-all.sh --wipe_data

# rebuild only the frontend image
bash infra/scripts/start-all.sh --rebuild=frontend

# rebuild frontend and backend images
bash infra/scripts/start-all.sh --rebuild=frontend,backend

# stop the full stack
bash infra/scripts/stop-all.sh

# stop and remove volumes
bash infra/scripts/stop-all.sh --volumes
```

## Configuration

The full Docker stack reads the repository-root `.env`. Inside Docker, services address each other by Compose service name (`backend`, `minio`, `qdrant`, `postgres-illinois-chat`); browser-facing URLs use `localhost`. See:

- [Environment Variables](environment-variables.md) — the complete reference.
- [Configuration](configuration.md) — authentication (Keycloak) and model setup.
- [System Architecture](architecture.md) — how the services fit together.

## Optional: local model serving

`infra/docker/docker-compose.models.yaml` adds LLM-serving containers (Ollama/vLLM) so the whole stack — including inference — runs on your hardware.

## Production checklist

- [ ] Change every default password in `.env` (`POSTGRES_PASSWORD`, `INGEST_REDIS_PASSWORD`, `QDRANT_API_KEY`, MinIO credentials, `KEYCLOAK_ADMIN_PASSWORD`).
- [ ] Terminate TLS in front of the stack (reverse proxy such as nginx, Caddy, or Traefik).
- [ ] Restrict exposed ports to what users actually need (typically only the frontend).
- [ ] Back up the Docker volumes (Postgres, MinIO, Qdrant) on a schedule.
- [ ] Ensure `QDRANT_API_KEY` in `.env` matches `qdrant_config.yaml`.

For cloud deployment on AWS ECS Fargate, see [Cloud Deployment](../developers/deployment.md).
