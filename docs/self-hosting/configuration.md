# Configuration

How to configure authentication and language models on a self-hosted deployment. For the full variable reference see [Environment Variables](environment-variables.md).

## Authentication (Keycloak)

Illinois Chat uses [Keycloak](https://www.keycloak.org/) for authentication. The Docker stack bootstraps a ready-to-use realm from `infra/keycloak/realms/`:

- **Realm:** `illinois_chat_realm`
- **Client ID:** `illinois_chat`
- **Admin console:** `http://localhost:8080` (log in with `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD`)

The frontend authenticates users via OIDC against this realm and issues JWTs signed with `NEXT_PUBLIC_SIGNING_KEY`. User records live in Postgres.

Typical customizations in the Keycloak admin console:

- **Identity providers** — federate with your institution's SSO (SAML/OIDC) so users log in with existing accounts.
- **User federation** — connect LDAP/Active Directory.
- **Theme** — the Illinois Chat login theme ships in `infra/keycloak/theme/`.

!!! warning "Change the admin password"
    The default Keycloak admin password is `admin`. Change it before exposing the stack anywhere.

## LLM and embedding models

### Chat models

Each project selects its chat models in the project settings UI; see [LLM Providers](../concepts/llm-providers.md) for the supported list. On a self-hosted stack, the common setups are:

- **Bring-your-own-key** — users paste OpenAI/Anthropic/Azure keys in project settings; nothing to configure server-side.
- **Local serving** — run Ollama or vLLM (optionally via `infra/docker/docker-compose.models.yaml`) and set `OLLAMA_SERVER_URL` or use an OpenAI-compatible endpoint.
- **NCSA-hosted** — set `NCSA_HOSTED_API_KEY` and `NCSA_HOSTED_VLM_BASE_URL` if you have access.

### Embedding model

Retrieval depends on a single embedding model configured deployment-wide:

```env
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDING_API_BASE=http://host.docker.internal:11434/v1
```

Any OpenAI-compatible endpoint works (Ollama, vLLM, a hosted API). The default Qdrant collection is created for **4096-dimensional cosine vectors** to match Qwen3-Embedding-8B; if you switch to a model with a different dimension, recreate the collection accordingly.

## Database bootstrap

The Postgres schema is applied automatically from `infra/db/migrations/20250328_remote_schema.sql` by the start scripts. The Qdrant collection named in `QDRANT_COLLECTION_NAME` is created on first start.

## Vector database (Qdrant)

Qdrant reads `qdrant_config.yaml` at the repository root. Its API key **must match** the `QDRANT_API_KEY` value in `.env`.
