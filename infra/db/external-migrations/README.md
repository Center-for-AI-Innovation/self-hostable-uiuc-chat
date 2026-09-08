# External store migrations

Ordered, idempotent SQL scripts that bring an **external per-project Postgres**
(a project's `database` connection) up to date with document-related schema
changes made in the host database.

## Why this exists

Document schema changes reach three places, and only two of them are automatic:

| Target                                    | How it gets the change                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Host Postgres                             | `npm run db:migrate` (Drizzle, `apps/frontend/src/db/migrations/`)         |
| **Newly provisioned** external Postgres   | `infra/db/provision_external_pgvector_store.sql`, run once by the operator |
| **Already provisioned** external Postgres | Nothing — that is the gap this directory fills                             |

Drizzle migrations never run against external stores, and the provisioning
script only runs at provision time. Without an ordered set of scripts here,
every schema change has to be hand-ported to each existing external store from
memory.

## The convention

When a PR changes document-related schema — the `documents`, `doc_groups`,
`documents_doc_groups`, `documents_in_progress`, `documents_failed`, or
`embeddings` tables, or any trigger or function on the ingest/delete paths —
ship the change in **three** places:

1. A Drizzle migration under `apps/frontend/src/db/migrations/` (host).
2. A numbered file here, `NNNN_short_description.sql`, as a standalone SQL
   diff for external stores.
3. The corresponding edit to `infra/db/provision_external_pgvector_store.sql`,
   so freshly provisioned stores match without needing to replay anything.

Host-only concerns (`projects`, `project_external_connections`, the audit log,
chat and analytics tables) do **not** belong here — external stores never have
those tables.

### Rules for files in this directory

- **Idempotent.** Every file must be safe to run any number of times, against a
  store that is fully current and against one many migrations behind. Guard DDL
  with `IF NOT EXISTS` / `pg_constraint` / `pg_trigger` lookups, and prefer
  `CREATE OR REPLACE` for functions. There is deliberately no bookkeeping table:
  idempotency is what makes replay safe, so nothing needs to track which files
  already ran.
- **Plain psql.** No Drizzle `--> statement-breakpoint` markers, no
  `\` meta-commands, no provider-specific syntax — these get run through `psql`
  or a provider SQL runner (e.g. Supabase's `apply_migration`).
- **Self-contained and transactional.** Wrap the file in `BEGIN` / `COMMIT` so a
  partial application cannot leave a store half-migrated. If a change cannot run
  inside a transaction (`CREATE INDEX CONCURRENTLY`, for instance), say so in the
  file header and leave the transaction out.
- **Numbered sequentially**, zero-padded to four digits, never renumbered or
  edited after merge. Fix a bad migration with a new one.
- **Cross-referenced.** The header should name the host migration it ports, so
  the pairing stays obvious.

Numbering here is independent of the Drizzle sequence — most host migrations
have no external counterpart, so the two will drift apart. `0001`/`0002` port
host `0013`/`0014`.

## Applying them

Replay the full set against each external store; idempotency makes this safe
regardless of how far behind the store is.

```bash
infra/db/external-migrations/apply.sh "postgresql://user:pass@host:5432/dbname"
```

Or by hand, in numeric order:

```bash
psql "postgresql://user:pass@host:5432/dbname" -v ON_ERROR_STOP=1 \
  -f infra/db/external-migrations/0001_documents_doc_groups_cascade.sql
```

`apply.sh --dry-run` lists what would run; `apply.sh --only 0001` applies a
single file. The connection URI can also come from `EXTERNAL_DATABASE_URI`.

Notes:

- Use a **direct or session-mode** connection (Supabase port 5432), not the
  transaction pooler — these scripts execute DDL. The pooler URI is for the
  registered runtime `connection_uri` only.
- The connecting role must **own** the affected tables. `0001` toggles a trigger
  with `ALTER TABLE ... DISABLE TRIGGER`, which requires ownership.
- Run against a store that has already been provisioned. `0001` raises a clear
  error if `documents_doc_groups` is missing, which means the store needs
  `provision_external_pgvector_store.sql` first — that script is current, so no
  replay is needed afterwards.

## Index

| File                                     | Ports host migration | Change                                                                                 |
| ---------------------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `0001_documents_doc_groups_cascade.sql`  | `0013`               | `ON DELETE CASCADE` FKs on the junction table; clean orphans and recompute `doc_count` |
| `0002_add_document_to_group_fk_noop.sql` | `0014`               | `add_document_to_group{,_url}` treat a mid-ingest FK violation as a logged no-op       |
