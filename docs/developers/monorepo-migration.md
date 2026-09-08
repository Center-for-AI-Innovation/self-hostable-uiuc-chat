# Monorepo migration: Illinois Chat

This document records the key `git subtree` commands and layout changes used to migrate to the `self-hostable-uiuc-chat` monorepo.

## Service imports

All commands were run from the monorepo root on branch `monorepo`.

### Submodule removal

```bash
git submodule deinit -f uiuc-chat-frontend uiuc-chat-backend ic_crawlee
git rm -f uiuc-chat-frontend uiuc-chat-backend ic_crawlee
rm -f .gitmodules
git commit -m "Remove frontend/backend/crawlee submodules for monorepo layout"
```

### Subtree adds

#### Frontend (uiuc-chat-frontend, branch illinois-chat)

```bash
git remote add uiuc-frontend git@github.com:Center-for-AI-Innovation/uiuc-chat-frontend.git
git fetch uiuc-frontend
git subtree add --prefix=apps/frontend uiuc-frontend illinois-chat
```

#### Backend (ai-ta-backend, branch illinois-chat)

```bash
git remote add uiuc-backend git@github.com:Center-for-AI-Innovation/ai-ta-backend.git
git fetch uiuc-backend
git subtree add --prefix=apps/backend uiuc-backend illinois-chat
```

#### Crawlee (crawlee, branch main)

```bash
git remote add uiuc-crawlee git@github.com:Center-for-AI-Innovation/crawlee.git
git fetch uiuc-crawlee
git subtree add --prefix=apps/crawlee uiuc-crawlee main
```

## Ongoing syncs

To pull new changes from the legacy repos into `monorepo`:

```bash
# Frontend (illinois-chat)
git checkout monorepo
git fetch uiuc-frontend
git subtree pull --prefix=apps/frontend uiuc-frontend illinois-chat

# Backend (illinois-chat)
git fetch uiuc-backend
git subtree pull --prefix=apps/backend uiuc-backend illinois-chat

# Crawlee (main)
git fetch uiuc-crawlee
git subtree pull --prefix=apps/crawlee uiuc-crawlee main
```

## Infra layout changes

Infra-related files were moved into `infra/*`:

- Database migrations and init:
  - `db/` → `infra/db/db/`
- Keycloak realms and theme:
  - `keycloak/` → `infra/keycloak/keycloak/`
  - `keycloak-theme/` → `infra/keycloak/theme/`
- Docker Compose:
  - `docker-compose.yaml` → `infra/docker/docker-compose.yaml`
  - `docker-compose.dev.yaml` → `infra/docker/docker-compose.dev.yaml`
  - `docker-compose.models.yaml` → `infra/docker/docker-compose.models.yaml`
- Scripts:
  - `init-dev.sh`, `init.sh`, `initialize.sh`, `run-dev.sh`, `run.sh`, `init-scripts/` → `infra/scripts/`

All documentation and scripts were updated to reference:

- `apps/frontend`, `apps/backend`, `apps/crawlee` for service code.
- `infra/docker/docker-compose*.yaml` for compose.
- `infra/db/db/migrations` for DB bootstrap.
- `infra/keycloak/theme` for Keycloak theme mounts.
