# Development Setup

Set up a local development environment where the app processes run directly (with hot reload) while Docker provides the shared infrastructure.

For the all-Docker experience instead, see [Self-Hosting](../self-hosting/index.md).

## Prerequisites

- Docker and Docker Compose
- Python 3.10 or 3.11 (backend and ingest worker)
- Node.js 20.19+ or 22.12+ (frontend)

## Quick start

### 1. Start infrastructure services

```bash
bash infra/scripts/start-dev.sh
```

This script:

- creates a repository-root `.env` from `.env.template` if needed;
- creates or updates app-local env files (`apps/backend/.env`, `apps/frontend/.env`, `apps/crawlee/.env`) without overwriting existing values;
- starts shared dev infrastructure from `infra/docker/docker-compose.dev.yaml`;
- applies the Postgres schema from `infra/db/migrations/20250328_remote_schema.sql`;
- creates the MinIO `uiuc-chat` bucket;
- ensures the configured Qdrant collection exists with 4096-dimensional cosine vectors.

To start from a clean data state (removes dev containers and volumes first):

```bash
bash infra/scripts/start-dev.sh --clean
```

### 2. Configure environment variables

In development mode the compose file only runs infrastructure; each app reads its own env file:

- `apps/backend/.env` — Flask backend and ingest worker
- `apps/frontend/.env` — Next.js frontend (`npm run local`)
- `apps/crawlee/.env` — Crawlee, if run outside Docker

OpenAI is **not** required. Configure `EMBEDDING_MODEL` and `EMBEDDING_API_BASE` for an OpenAI-compatible embedding endpoint; the default collection expects Qwen3-Embedding-8B vectors (dimension 4096).

For uploads and ingest, always use the MinIO **API** port, not the console port:

```env
# apps/frontend/.env
MINIO_ENDPOINT=http://localhost:10000
MINIO_PUBLIC_ENDPOINT=http://localhost:10000
NEXT_PUBLIC_S3_ENDPOINT=http://localhost:10000

# apps/backend/.env
MINIO_URL=http://localhost:10000
MINIO_ENDPOINT=http://localhost:10000
MINIO_PUBLIC_ENDPOINT=http://localhost:10000
```

`http://localhost:9001` is the MinIO management console and must not be used for S3 uploads.

### 3. Start the app processes

Run each in its own terminal:

```bash
# Flask backend
cd apps/backend
flask --app ai_ta_backend.main:app --debug run --port 8000
```

```bash
# ingest worker
cd apps/backend
python ai_ta_backend/rabbitmq/worker.py
```

```bash
# Next.js frontend
cd apps/frontend
npm run local
```

## Manual setup (alternative)

=== "Backend"

    ```bash
    cd apps/backend

    python3.11 -m venv venv
    source venv/bin/activate

    pip install -r requirements.txt
    pip install -r ai_ta_backend/rabbitmq/requirements.txt

    flask --app ai_ta_backend.main:app --debug run --port 8000
    # in another terminal:
    python ai_ta_backend/rabbitmq/worker.py
    ```

=== "Frontend"

    ```bash
    cd apps/frontend

    npm install
    npm run local
    ```

## Services overview

| Service | URL | Description |
| --- | --- | --- |
| Frontend | http://localhost:3000 | Next.js application |
| Backend API | http://localhost:8000 | Flask API |
| Keycloak | http://localhost:8080 | Authentication service |
| MinIO API | http://localhost:10000 | Object storage API |
| MinIO Console | http://localhost:9001 | Object storage management |
| RabbitMQ Management | http://localhost:15672 | Message queue management |

## Database configuration

PostgreSQL is recommended:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
```

SQLite is available as a lightweight alternative:

```env
SQLITE_DB_NAME=uiuc_chat_local.db
```

## Linting and PRs

Linting is enforced with [Trunk](https://trunk.io) (`npm exec trunk check` in the frontend, or the `trunk` CLI). Pull requests run the checks in `.github/workflows/pr-checks.yml`.

## Troubleshooting

**Database connection issues**

- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check accessibility:
  `docker compose --project-directory . -f infra/docker/docker-compose.dev.yaml exec postgres-illinois-chat pg_isready -U postgres`

**Port conflicts**

- Modify port mappings in `infra/docker/docker-compose.dev.yaml` and update the corresponding `.env` values.

**Missing dependencies**

- Backend: activate the virtualenv and `pip install -r requirements.txt`.
- Frontend: `npm install` in `apps/frontend`.

**Environment variables**

- Re-run `bash infra/scripts/start-dev.sh` to create or append missing local env keys.
- Fill hosted model/API values in the app-local `.env` files when you need non-local services.

## Stopping everything

```bash
# stop app processes: Ctrl+C in each terminal

# stop infrastructure
bash infra/scripts/stop-dev.sh

# stop infrastructure and remove local volumes/data
bash infra/scripts/stop-dev.sh --volumes
```
