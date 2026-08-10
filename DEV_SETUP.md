# UIUC.chat Development Setup

This guide will help you set up the UIUC.chat development environment for local development.

## Prerequisites

- Docker and Docker Compose
- Python 3.10 or 3.11 for the backend and ingest worker
- Node.js 20.19+ or 22.12+ for the frontend toolchain

## Quick Start

### 1. Start Infrastructure Services

First, start the required infrastructure services. On the very first run
(or any time the database volume is empty), pass `--create-schema` so the
database schema gets created:

```bash
bash infra/scripts/start-dev.sh --create-schema
```

On later runs — including after `stop-dev.sh`, which stops containers but
keeps volumes (and therefore the database) unless you pass `--volumes` —
just run it without flags; the schema is left untouched:

```bash
bash infra/scripts/start-dev.sh
```

This script will:

- Create a repository-root `.env` file from `.env.template` if needed
- Create or update app-local env files for backend, frontend, and Crawlee without overwriting existing values
- Start shared development infrastructure from `infra/docker/docker-compose.dev.yaml`
- With `--create-schema` (or `--clean`): apply the Postgres schema from `infra/db/init-schema.sql` to the empty database (derived from the frontend Drizzle schema; includes pgvector and the external-connections tables). Without a flag, an already-initialized schema is verified and left untouched.
- Create the MinIO `uiuc-chat` bucket
- Ensure the configured Qdrant collection exists with 4096-dimensional cosine vectors

To start from a clean local data state:

```bash
bash infra/scripts/start-dev.sh --clean
```

This removes the dev Compose containers and volumes before starting them
again, and recreates the database schema on the fresh database —
`--clean` and `--create-schema` are therefore mutually exclusive.

Note: the `postgres-illinois-chat` service runs the pgvector-enabled
`pgvector/pgvector:pg17` image (the schema needs the `vector` extension).
If your volumes were created by the previous stock `postgres` image, the
data directory is incompatible — run once with `--clean` to recreate them.

### 2. Configure Environment Variables

Update the following files with your API keys:

- `apps/backend/.env` - Backend configuration
- `apps/frontend/.env` - Frontend configuration

OpenAI is not required for local self-hosting. Configure `EMBEDDING_MODEL` and `EMBEDDING_API_BASE` for an OpenAI-compatible embedding endpoint; the default collection setup expects Qwen3 Embedding 8B vectors with dimension 4096.

For development mode, `infra/docker/docker-compose.dev.yaml` only starts shared infrastructure. The backend, ingest worker, frontend, and Crawlee read their own app-local env files when you run them directly.

- `apps/backend/.env` - Flask backend and ingest worker
- `apps/frontend/.env` - Next.js frontend when using `npm run local`
- `apps/crawlee/.env` - Crawlee, if running it outside Docker

For the full Docker setup, use the repository-root `.env` instead. `infra/docker/docker-compose.yaml` maps root `.env` values into each container and overrides local service URLs with Docker service names such as `backend`, `minio`, `qdrant`, and `postgres-illinois-chat`.

For local dev uploads and ingest, use the MinIO API port, not the MinIO console port:

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

`http://localhost:9001` is the MinIO management console and should not be used for S3 uploads.

### 3. Start Development Services

```bash
cd apps/backend
flask --app ai_ta_backend.main:app --debug run --port 8000
```

In another terminal, start the ingest worker:

```bash
cd apps/backend
python ai_ta_backend/rabbitmq/worker.py
```

In another terminal, start the frontend:

```bash
cd apps/frontend
npm run local
```

## Manual Setup (Alternative)

If you prefer to set up manually:

### Backend Setup

```bash
cd apps/backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -r ai_ta_backend/rabbitmq/requirements.txt

# Set up environment variables (see apps/backend/.env)
# Start the server
flask --app ai_ta_backend.main:app --debug run --port 8000

# In another terminal, start the ingest worker
python ai_ta_backend/rabbitmq/worker.py
```

### Frontend Setup

```bash
cd apps/frontend

# Install dependencies
npm install

# Set up environment variables (see apps/frontend/.env)
# Start the development server
npm run local
```

## Services Overview

| Service             | URL                    | Description               |
| ------------------- | ---------------------- | ------------------------- |
| Frontend            | http://localhost:3000  | Next.js application       |
| Backend API         | http://localhost:8000  | Flask API                 |
| Keycloak            | http://localhost:8080  | Authentication service    |
| MinIO API           | http://localhost:10000 | Object storage API        |
| MinIO Console       | http://localhost:9001  | Object storage management |
| RabbitMQ Management | http://localhost:15672 | Message queue management  |

## Database Configuration

The application supports two database configurations:

### PostgreSQL (Recommended)

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
```

### SQLite (Alternative)

```env
SQLITE_DB_NAME=uiuc_chat_local.db
```

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check if the database is accessible: `docker compose --project-directory . -f infra/docker/docker-compose.dev.yaml exec postgres-illinois-chat pg_isready -U postgres`

### Port Conflicts

- If ports are already in use, you can modify the port mappings in `infra/docker/docker-compose.dev.yaml`
- Update the corresponding environment variables in the `.env` files

### Missing Dependencies

- Backend: Ensure you're in the virtual environment and run `pip install -r requirements.txt`
- Frontend: Run `npm install` in the frontend directory

### Environment Variables

- Run `bash infra/scripts/start-dev.sh` to create or append missing local env keys.
- Fill hosted model/API values in the app-local `.env` files when you need non-local services.

## Development Workflow

1. **Start infrastructure**: `bash infra/scripts/start-dev.sh`
2. **Start backend**: `cd apps/backend && flask --app ai_ta_backend.main:app --debug run --port 8000`
3. **Start worker**: `cd apps/backend && python ai_ta_backend/rabbitmq/worker.py`
4. **Start frontend**: `cd apps/frontend && npm run local`
5. **Make changes** to your code
6. **Stop services**: `Ctrl+C` in each app terminal

## Stopping Everything

```bash
# Stop development services
# Press Ctrl+C in the backend, worker, and frontend terminals

# Stop infrastructure services
bash infra/scripts/stop-dev.sh

# Stop infrastructure and remove local volumes/data
bash infra/scripts/stop-dev.sh --volumes
```
