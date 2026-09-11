---
date: 2026-05-05
categories:
  - Releases
authors:
  - caii
---

# Illinois Chat is now a self-hostable monorepo

Illinois Chat's frontend, backend, and crawler now live together in a single repository — [Center-for-AI-Innovation/Illinois-Chat](https://github.com/Center-for-AI-Innovation/Illinois-Chat) — and the entire platform can be started with one command.

<!-- more -->

## What changed

- **One repository.** The previously separate `uiuc-chat-frontend`, `ai-ta-backend`, and `crawlee` repositories were merged (via `git subtree`, with full history preserved) into `apps/frontend`, `apps/backend`, and `apps/crawlee`. See [Monorepo Migration](../../developers/monorepo-migration.md) for the details.
- **One-command self-hosting.** `bash infra/scripts/start-all.sh` brings up the frontend, backend, ingest worker, Crawlee, Postgres, Redis, RabbitMQ, MinIO, Qdrant, and Keycloak, then initializes the database and vector collection. See the [Self-Hosting guide](../../self-hosting/index.md).
- **Infrastructure as code.** Compose files, database migrations, and Keycloak realms all live under `infra/`.
- **RabbitMQ ingest queue.** The document-ingest pipeline now runs on RabbitMQ with a dedicated worker process.
- **Keycloak authentication.** A ready-to-use realm ships with the stack, replacing hosted auth for self-hosted deployments.
- **No OpenAI dependency for self-hosting.** Embeddings default to Qwen3-Embedding-8B behind any OpenAI-compatible endpoint, and chat can run on Ollama/vLLM or free NCSA-hosted models.
- **Apache 2.0.** The platform is licensed under the Apache License, Version 2.0.

## Getting started

```bash
git clone https://github.com/Center-for-AI-Innovation/Illinois-Chat.git
cd Illinois-Chat
bash infra/scripts/start-all.sh
```

Then open http://localhost:3000. Full instructions are in the [Self-Hosting guide](../../self-hosting/index.md).
