# Environment Variables

There are two environment modes:

- **Full Docker / e2e** — reads the repository-root `.env` (created from `.env.template`). Compose maps values into each container and overrides local service URLs with Docker service names.
- **Local development** — app processes read their own files: `apps/backend/.env`, `apps/frontend/.env`, `apps/crawlee/.env`. `infra/scripts/start-dev.sh` creates or appends missing keys without overwriting existing values.

!!! danger "Never commit `.env` files"
    Environment files contain secrets. They are gitignored — keep it that way.

## Required local secrets

Change all of these before any non-local use:

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | *placeholder* | PostgreSQL password. |
| `INGEST_REDIS_PASSWORD` | *placeholder* | Redis password for the ingest queue. |
| `QDRANT_API_KEY` | *placeholder* | Qdrant API key — **must match `qdrant_config.yaml`**. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `minioadmin` | MinIO (S3) credentials. |
| `KEYCLOAK_ADMIN_PASSWORD` | `admin` | Keycloak admin password. |

## Resource names

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_DATABASE` | `postgres` | Database user and name. |
| `S3_BUCKET_NAME` | `uiuc-chat` | Object-storage bucket for uploaded files. |
| `QDRANT_COLLECTION_NAME` | `illinois-chat-qwen` | Vector collection (4096-dim cosine vectors). |
| `AWS_REGION` | `us-east-1` | Region passed to the S3 client. |

## Host ports

| Variable | Default |
| --- | --- |
| `FRONTEND_PORT` | `3000` |
| `CRAWLEE_PORT` | `3345` |
| `POSTGRES_PORT` | `5432` |
| `KEYCLOAK_DB_PORT` | `5433` |
| `PUBLIC_MINIO_API_PORT` | `10000` |
| `PUBLIC_MINIO_DASHBOARD_PORT` | `9001` |

MinIO endpoints for app processes (always the **API** port, never the console):

```env
MINIO_ENDPOINT=http://localhost:10000
MINIO_PUBLIC_ENDPOINT=http://localhost:10000
MINIO_URL=http://localhost:10000
```

## Authentication (Keycloak)

| Variable | Default | Description |
| --- | --- | --- |
| `KEYCLOAK_ADMIN_USERNAME` | `admin` | Keycloak admin user. |
| `NEXT_PUBLIC_KEYCLOAK_URL` | `http://localhost:8080/` | Keycloak base URL. |
| `NEXT_PUBLIC_KEYCLOAK_REALM` | `illinois_chat_realm` | Realm (bootstrapped from `infra/keycloak/realms/`). |
| `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID` | `illinois_chat` | OIDC client ID. |
| `NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG` | `True` | Use the Illinois Chat auth configuration. |
| `NEXT_PUBLIC_SIGNING_KEY` | *(empty)* | JWT signing key for the frontend. |

## Model endpoints

Model, embedding, and API-key values are intentionally empty in the template so each deployment picks its own providers:

| Variable | Default | Description |
| --- | --- | --- |
| `EMBEDDING_MODEL` | `Qwen/Qwen3-Embedding-8B` | Embedding model (4096-dim vectors expected by the default Qdrant collection). |
| `EMBEDDING_API_BASE` | `http://host.docker.internal:11434/v1` | OpenAI-compatible endpoint serving the embedding model (default points at Ollama on the host). |
| `NCSA_HOSTED_API_KEY` | *(empty)* | Key for NCSA-hosted models. |
| `NCSA_HOSTED_VLM_BASE_URL` | *(empty)* | Base URL for the NCSA-hosted vision model. |
| `OLLAMA_SERVER_URL` | *(empty)* | Ollama server for local LLM serving. |

## Optional observability & integrations

| Variable | Description |
| --- | --- |
| `POSTHOG_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | PostHog product analytics. |
| `NOMIC_API_KEY` | Nomic Atlas semantic maps of documents and conversations. |
| `SENTRY_DSN` | Sentry error monitoring. |

See `.env.template` at the repository root for the canonical, up-to-date list.
