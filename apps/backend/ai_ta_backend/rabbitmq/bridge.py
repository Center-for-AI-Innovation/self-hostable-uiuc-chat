"""
Minimal HTTP -> RabbitMQ ingest bridge.

Exposes a single POST /ingest endpoint that mirrors the backend's /ingest route:
it inserts a `documents_in_progress` row and publishes the job to RabbitMQ by
reusing `rmqueue.Queue.addJobToIngestQueue`. External producers (the Crawlee
service via INGEST_URL, migration scripts) can therefore drive ingest without
the full Flask backend deployed.

Runs from the same image as worker.py (same build context); the ECS bridge
service simply overrides the command to `python bridge.py`.

Environment (identical to the worker):
  RABBITMQ_URL / RABBITMQ_QUEUE / RABBITMQ_SSL   -> Amazon MQ broker + queue
  POSTGRES_ENDPOINT/PORT/DATABASE/USERNAME/PASSWORD -> documents DB
"""
import logging
import os

from flask import Flask, jsonify, request

try:
    from ai_ta_backend.rabbitmq.rmqueue import Queue
except ModuleNotFoundError:  # standalone container: rabbitmq dir is the workdir
    from rmqueue import Queue

logging.basicConfig(level=logging.INFO)

# Optional bearer-token auth. When INGEST_API_KEY is set (recommended for a
# public/internet-facing deployment), callers must send
# `Authorization: Bearer <INGEST_API_KEY>`. Crawlee already sends this header
# (its BEAM_API_KEY must equal INGEST_API_KEY). If unset, the endpoint is open.
INGEST_API_KEY = os.getenv("INGEST_API_KEY")

app = Flask(__name__)


@app.route('/api/healthcheck', methods=['GET'])
def healthcheck():
    return jsonify({"status": "OK"}), 200


@app.route('/ingest', methods=['POST'])
def ingest():
    """Queue an ingest job. Accepts the same payload as the backend /ingest:
    course_name, readable_filename, s3_paths | content | url, base_url, groups, ...
    """
    if INGEST_API_KEY and request.headers.get("Authorization", "") != f"Bearer {INGEST_API_KEY}":
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(force=True, silent=True)
    if not data or not data.get('course_name'):
        return jsonify({"error": "missing JSON body or 'course_name'"}), 400

    # addJobToIngestQueue reads inputs['readable_filename'] unconditionally.
    data.setdefault('readable_filename', '')

    try:
        # One short-lived AMQP connection per request keeps this thread-safe under
        # Flask's threaded server (pika BlockingConnection is not thread-safe).
        with Queue() as queue:
            task_id = queue.addJobToIngestQueue(data)
        return jsonify({"outcome": "Queued Ingest task", "task_id": task_id}), 200
    except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
        logging.exception("Failed to queue ingest job")
        return jsonify({"error": str(exc)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8001, threaded=True)
