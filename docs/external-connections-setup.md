# External Connections Setup

Projects (courses) can bring their own infrastructure instead of using the
shared defaults: an external S3/MinIO bucket, an external PostgreSQL
(documents + pgvector embeddings), an external Qdrant, and/or their own
embedding provider. Routing is decided per project at runtime from the
`project_external_connections` table on the **host** database — there are no
global environment switches.

This guide covers operator setup:

1. [Prerequisites](#prerequisites)
2. [Provisioning an external Postgres (documents + pgvector)](#provisioning-an-external-postgres)
3. [Registering a project's connections with the CLI](#registering-connections-with-the-cli)
4. [Keeping existing external stores up to date](#keeping-existing-external-stores-up-to-date)
5. [Verifying and troubleshooting](#verifying-and-troubleshooting)

Deeper reference material lives with the apps:

- Feature overview: [`apps/backend/docs/features/external-connections.md`](../apps/backend/docs/features/external-connections.md)
- Full config reference (all fields, multi-collection search, post-processors):
  [`apps/backend/docs/developers/external-connections-config.md`](../apps/backend/docs/developers/external-connections-config.md)
- Frontend architecture (ConnectionManager, caching, SSRF-guarded probes):
  [`apps/frontend/docs/EXTERNAL_CONNECTIONS.md`](../apps/frontend/docs/EXTERNAL_CONNECTIONS.md)

## Prerequisites

- **`ENCRYPTION_MASTER_KEY`** must be set to the _same value_ for the
  frontend, backend, and ingest worker — configs are stored AES-256-GCM
  encrypted, written by the frontend and decrypted by all three. The dev
  bootstrap (`infra/scripts/start-dev.sh`) generates one and syncs it into
  the app-local `.env` files automatically; for other deployments set it in
  your environment (see the root `.env.template` for the generation
  one-liner).
- **A super-admin account** on the frontend. Connection CRUD is restricted to
  super admins (`SUPER_ADMIN_EMAILS` / `src/utils/superAdmins.ts`).
- The host database schema must include the external-connections tables.
  Fresh setups get them from `infra/db/init-schema.sql` (applied by the
  setup scripts when run with `--create-schema`, or as part of a
  `--clean`/`--wipe_data` reset); existing databases created before this
  feature need to be recreated from it (dev: `start-dev.sh --clean`). The
  bundled `postgres-illinois-chat` service runs the pgvector-enabled
  `pgvector/pgvector:pg17` image, which the schema requires.

## Provisioning an external Postgres

When a project sets a `database` connection, its documents tables — and, if
the project has no Qdrant override, its pgvector embeddings — live in that
external database. The target database must be provisioned **before**
registering the connection:

```bash
psql "postgresql://user:password@db-host:5432/dbname" \
  -v ON_ERROR_STOP=1 \
  -f infra/db/provision_external_pgvector_store.sql
```

> **Pooled providers:** run this provisioning step against a **direct or
> session-mode connection** (e.g. Supabase port 5432) — it executes DDL and
> `CREATE EXTENSION`, which belong on a real session. The transaction-pooler
> URI recommended below is for the registered runtime `connection_uri` only.

The script is idempotent and project-agnostic. It creates only the ingest +
pgvector core the pipeline needs on the external side:

- `documents`, `doc_groups`, `documents_doc_groups`,
  `documents_in_progress`, `documents_failed`
- `embeddings` (`vector(4096)`) with its GIN filters and the
  `embeddings_embedding_1536_hnsw_idx` HNSW ANN index
- The ingest RPCs (`add_document_to_group`, `add_document_to_group_url`,
  `remove_document_from_group`) and doc-count/updated-at triggers

Requirements: PostgreSQL ≥ 15 with the pgvector extension available
(≥ 0.7 for `subvector`). Managed providers (RDS, Supabase, …) generally ship
it; the script runs `CREATE EXTENSION IF NOT EXISTS vector` itself.

> **Indexing an already-populated table:** the HNSW index in the script is
> instant on an empty database. If you are provisioning a database that
> already holds millions of embeddings, read the notes inside
> `infra/db/provision_external_pgvector_store.sql` about
> `maintenance_work_mem` and serial (non-parallel) `CREATE INDEX
CONCURRENTLY` builds first — getting this wrong turns a ~1 hour build into
> days.

## Registering connections with the CLI

`infra/scripts/add_external_project_script/external_connections_cli.py`
populates the **host** database through the frontend's authenticated API (the
frontend is the sole writer and handles encryption; the CLI never sees the
master key).

One-time setup:

```bash
cd infra/scripts/add_external_project_script
pip install -r requirements.txt
cp .external.env.template .external.env   # gitignored — never commit it
```

Fill in `.external.env`:

- `EXT_CONN_BASE_URL` — the running frontend (default `http://localhost:3000`)
- `ACCESS_TOKEN` — your super-admin JWT: log into the frontend, then copy the
  `access_token` cookie (DevTools → Application → Cookies)
- `EXT_PROJECT_NAME` — default project name for all commands
- The `EXT_*` block for each connection kind you plan to register (see the
  template's comments; only the kinds you use need filling)

Then:

```bash
# Probe a config without persisting anything (recommended first step):
python3 external_connections_cli.py test database

# Register the external documents/pgvector database for the project:
python3 external_connections_cli.py upsert database

# Other kinds work the same way (config built from .external.env):
python3 external_connections_cli.py upsert s3
python3 external_connections_cli.py upsert qdrant
python3 external_connections_cli.py upsert embedding

# Inspect what is stored (secrets come back masked):
python3 external_connections_cli.py get

# Disable / re-enable a project's overrides without deleting them:
python3 external_connections_cli.py set-active --active false

# Remove one kind (or the whole row when --kind is omitted):
python3 external_connections_cli.py delete --kind qdrant
```

Every command also accepts an explicit project name, a literal JSON config,
or `@path/to/config.json` — run with `--help` for details.

You can also probe the config **already stored** for a project (decrypted
server-side, never echoed back):

```bash
python3 external_connections_cli.py test database --stored
```

### Supabase / pooled Postgres

For the registered runtime `connection_uri`, use Supabase's **transaction
pooler** (port **6543**):

```
postgresql://postgres.<ref>:password@<region>.pooler.supabase.com:6543/postgres
```

Why: the session-mode pooler (same host, port 5432) pins one database session
per client connection and caps out around 15 sessions — the frontend and
backend connection pools can exhaust that on their own, producing
`EMAXCONNSESSION` / connect timeouts. Direct connections
(`db.<ref>.supabase.co`) bypass the pooler entirely (IPv6-only, low
`max_connections`). Transaction mode multiplexes idle clients and avoids both
problems.

The app is fully transaction-mode compatible: the frontend opens external
pools with `prepare: false` (no named prepared statements) and scopes its
pgvector tuning with `SET LOCAL` inside explicit transactions; the backend's
psycopg2 driver needs no changes.

Session-mode and direct Supabase URIs are still **accepted** — the `test`
probe and `upsert` respond with a warning rather than rejecting them. The URI
is stored verbatim; no automatic port rewriting is done.

### How routing behaves after registration

- **Vector engine**: a project with an active `qdrant` config is served by
  Qdrant (via the Python backend); every other project uses pgvector — on the
  host Postgres, or on the project's external Postgres when a `database`
  config is set.
- **S3**: uploads, downloads, and presigned URLs use the project's `s3`
  config when present, otherwise the shared default bucket.
- **Embeddings**: ingest and retrieval use the project's `embedding` config
  (provider must be in `ALLOWED_EMBEDDING_PROVIDERS`, default
  `openai,ollama`); otherwise the environment default.
- Config changes take effect immediately for new requests (the API
  invalidates the per-project cache on every successful write).

## Keeping existing external stores up to date

`npm run db:migrate` only touches the **host** database, and
`provision_external_pgvector_store.sql` only runs when a store is first
provisioned. Schema changes to the document/ingest tables therefore never reach
an already-provisioned external Postgres on their own.

`infra/db/external-migrations/` holds an ordered set of idempotent SQL scripts
for exactly that. Replay the whole set against each external store after
pulling a release that changed document schema:

```bash
infra/db/external-migrations/apply.sh "postgresql://user:password@db-host:5432/dbname"
```

Every script is safe to re-run, so there is nothing to track per store — a store
that is already current is left unchanged. As with provisioning, use a direct or
session-mode connection (not the transaction pooler), with a role that owns the
document tables.

Freshly provisioned stores do **not** need this: the provisioning script is kept
in sync and already includes every change.

Contributors: the convention for adding to that directory — and the rule that
`provision_external_pgvector_store.sql` moves with it — is documented in
[`infra/db/external-migrations/README.md`](../infra/db/external-migrations/README.md).

## Verifying and troubleshooting

- `test` probes run server-side with SSRF protections — private/loopback
  addresses are rejected by design. A `network` error code from a probe
  usually means the target is not publicly reachable from the frontend.
- `401` from the CLI: the `ACCESS_TOKEN` cookie value expired — grab a fresh
  one from the browser.
- `403`: the account is not in the super-admin allowlist.
- Decryption warnings in backend/worker logs mean `ENCRYPTION_MASTER_KEY`
  differs between services; per-project overrides silently fall back to the
  shared defaults until the keys match.
- Ingest writes fail against an external Postgres if it was not provisioned —
  the worker expects the RPCs and tables from
  `provision_external_pgvector_store.sql` to exist.
- Document-group counts that look wrong only for projects on an external
  Postgres usually mean the store is behind on
  [external migrations](#keeping-existing-external-stores-up-to-date); replaying
  them repairs the drift as well as preventing it.
- Every write is recorded in `project_connection_audit_log` (actor, action,
  changed field names — never values) on the host database.
