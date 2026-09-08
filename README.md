# Illinois Chat

Illinois Chat is a self-hostable AI chat platform for building course, research, and organization-specific assistants over curated documents and web content.

This repository contains the full monorepo needed to run Illinois Chat locally or in a Docker-based self-hosted environment.

![Illinois Chat homepage showing chatbot creation and material upload](media/illinois_chat_ss.png)

## What Is Included

- `apps/frontend`: Next.js web application.
- `apps/backend`: Flask API and ingest worker.
- `apps/crawlee`: Crawlee service for web crawling.
- `infra/docker`: Docker Compose files for full-stack and local-development runs.
- `infra/db`: Postgres schema and database configuration.
- `infra/keycloak`: Keycloak realm and theme assets.

## Prerequisites

- Docker and Docker Compose
- Python 3.10 or 3.11 for local backend development
- Node.js 20.19+ or 22.12+ for local frontend development

## Quickstart

Use the full Docker stack when you want the closest self-hosted or e2e environment. It starts the application services and all required infrastructure.

```bash
# First run (empty database): create the schema too
bash infra/scripts/start-all.sh --create-schema

# Later runs (database already initialized)
bash infra/scripts/start-all.sh
```

The script creates a repository-root `.env` from `.env.template` if needed, starts the frontend, backend, ingest worker, Crawlee, Postgres (pgvector-enabled `pgvector/pgvector:pg17`), Redis, RabbitMQ, MinIO, Qdrant, and Keycloak, then initializes the database (with `--create-schema` or `--wipe_data`) and Qdrant collection. Stopping the stack with `infra/scripts/stop-all.sh` keeps the volumes, so the database survives stop/start cycles without recreating the schema.

To reset local Docker data before starting:

```bash
bash infra/scripts/start-all.sh --wipe_data
```

`--wipe_data` recreates the database schema on the fresh volumes, so it cannot be combined with `--create-schema`.

To stop the full stack:

```bash
bash infra/scripts/stop-all.sh

# also remove full-stack volumes
bash infra/scripts/stop-all.sh --volumes
```

## Local Development

Use the dev stack when you want to run app processes directly with hot reload while Docker provides shared infrastructure.

```bash
bash infra/scripts/start-dev.sh
```

This starts `infra/docker/docker-compose.dev.yaml` and non-destructively creates or appends missing keys in:

- `apps/backend/.env`
- `apps/frontend/.env`
- `apps/crawlee/.env`

Run the backend, ingest worker, and frontend in separate terminals:

```bash
cd apps/backend
flask --app ai_ta_backend.main:app --debug run --port 8000
```

```bash
cd apps/backend
python ai_ta_backend/rabbitmq/worker.py
```

```bash
cd apps/frontend
npm run local
```

To stop local development infrastructure:

```bash
bash infra/scripts/stop-dev.sh

# also remove local-development volumes
bash infra/scripts/stop-dev.sh --volumes
```

### Sim AI Local Stack

For the user-facing side — signing in to Sim via Keycloak SSO, the admin approval flow, and connecting a Sim workspace to a project's tools — see [`docs/sim-access-and-tools.md`](docs/sim-access-and-tools.md).

The full and dev Docker stacks also start Sim AI against the same local Keycloak realm for SSO testing while keeping Sim's pgvector database isolated. No separate Sim checkout is required; the stack uses the upstream Sim container images.

- Sim app: `http://localhost:3010`
- Sim realtime: `http://localhost:3011`
- Sim pgvector Postgres: `localhost:55432`
- Shared Keycloak: `http://localhost:8080`

Sim SSO uses the same local Keycloak realm as the app. Keycloak owns user authentication and creates Sim identities through the OIDC callback; the stack does not seed test users or passwords. `SIM_SSO_DOMAIN` is a comma-separated list of email domains routed to this Keycloak provider and defaults to `illinois.edu,gmail.com`. New Sim users are held in a pending state until a Sim platform admin approves them with the existing Unban action under Settings > Admin. `SIM_APPROVAL_ADMIN_EMAIL` identifies the bootstrap platform admin; it has no default — set it to your address in `.env`, or the Sim stack refuses to start. This approval gate is implemented in Sim's database (see `infra/docker/sim/approval-setup.sql`) so the stack can continue using the upstream Sim images; approving, blocking, or re-blocking an email in the `sim_user_approval` table takes effect immediately, ending any live sessions of a blocked user. Sim's four secrets — `SIM_API_ENCRYPTION_KEY`, `SIM_BETTER_AUTH_SECRET`, `SIM_ENCRYPTION_KEY` and `SIM_INTERNAL_API_SECRET` — have no defaults; the stack refuses to start without them, and `start-dev.sh` / `start-all.sh` generate deployment-specific values into the root `.env` on first run. `SIM_API_ENCRYPTION_KEY` encrypts Sim API keys at rest and must be exactly 64 hexadecimal characters (`openssl rand -hex 32`). Outbound Sim requests are limited to sim.ai, `SIM_API_BASE_URL`'s origin, and any origins listed in `SIM_ALLOWED_SIM_ORIGINS` (comma-separated) — a project's Sim base URL must be one of these.

The Sim images are pinned by digest rather than tracking `latest`, so upgrading Sim is a deliberate change: the approval gate above patches Sim's own `user` table, and an unreviewed upgrade could break — or open — it. To move to a newer Sim, resolve the digest with `docker buildx imagetools inspect ghcr.io/simstudioai/simstudio:latest` and set `SIM_APP_IMAGE` (and the matching `SIM_REALTIME_IMAGE` / `SIM_MIGRATIONS_IMAGE`) in `.env`. Override other `SIM_*` values there if ports or credentials need to change.

## Configuration

There are two environment modes:

- Full Docker/e2e reads the repository-root `.env`.
- Local development reads `apps/backend/.env`, `apps/frontend/.env`, and `apps/crawlee/.env`.

Change default passwords before using any non-local environment. Hosted model, embedding, and API-key values are intentionally generated as empty keys so each deployment can choose its own providers.

Inside Docker, services talk to each other through Compose names such as `backend`, `minio`, `qdrant`, and `postgres-illinois-chat`. Browser-facing URLs use localhost.

### MinIO

Use the MinIO API endpoint for uploads and presigned URLs, not the MinIO console port.

- Full Docker/e2e API: `http://localhost:9000`
- Local development API: `http://localhost:10000`
- MinIO console: `http://localhost:9001`

## Common Commands

```bash
# rebuild only the frontend image
bash infra/scripts/start-all.sh --rebuild=frontend

# rebuild both frontend and backend images
bash infra/scripts/start-all.sh --rebuild=frontend,backend
```

## Documentation

See `DEV_SETUP.md` for local development details. Published docs are available at https://docs.uiuc.chat.

Projects can bring their own S3, PostgreSQL/pgvector, Qdrant, and embedding
provider — see [`docs/external-connections-setup.md`](docs/external-connections-setup.md)
for provisioning an external database and registering per-project connections.

## License

Illinois Chat is licensed under the Apache License, Version 2.0. See `LICENSE`.
