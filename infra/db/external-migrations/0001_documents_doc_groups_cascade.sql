-- 0001_documents_doc_groups_cascade.sql
--
-- External-store port of apps/frontend/src/db/migrations/
-- 0013_documents_doc_groups_cascade.sql.
--
-- Cascade junction deletes when a document (or group) is removed, so
-- trg_update_doc_count_after_insert keeps doc_groups.doc_count in sync, and
-- repair the drift left behind by deletes that happened before the FKs existed.
--
-- Order matters:
--   1. Disable the count trigger (orphan DELETEs would otherwise push
--      already-wrong counts further negative)
--   2. Delete orphaned junction rows
--   3. Recompute doc_count from the junction table
--   4. Re-enable the trigger
--   5. Add the FK constraints
--
-- Unlike the equivalent block in provision_external_pgvector_store.sql — which
-- skips the repair once the FKs exist, because a freshly provisioned store has
-- nothing to repair — steps 1-4 run unconditionally here. Counts on a live
-- store can drift for reasons unrelated to the FKs, and re-running the repair
-- is the point of replaying this file.
--
-- Requires ownership of public.documents_doc_groups (ALTER TABLE ... DISABLE
-- TRIGGER). Safe to re-run.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.documents_doc_groups') IS NULL THEN
    RAISE EXCEPTION 'public.documents_doc_groups is missing — provision this store with infra/db/provision_external_pgvector_store.sql first';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_update_doc_count_after_insert'
      AND tgrelid = 'public.documents_doc_groups'::regclass
  ) THEN
    ALTER TABLE public.documents_doc_groups
      DISABLE TRIGGER trg_update_doc_count_after_insert;
  END IF;

  DELETE FROM public.documents_doc_groups ddg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.documents d WHERE d.id = ddg.document_id
  );

  DELETE FROM public.documents_doc_groups ddg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.doc_groups dg WHERE dg.id = ddg.doc_group_id
  );

  UPDATE public.doc_groups dg
  SET doc_count = (
    SELECT COUNT(*) FROM public.documents_doc_groups ddg
    WHERE ddg.doc_group_id = dg.id
  );

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_update_doc_count_after_insert'
      AND tgrelid = 'public.documents_doc_groups'::regclass
  ) THEN
    ALTER TABLE public.documents_doc_groups
      ENABLE TRIGGER trg_update_doc_count_after_insert;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_doc_groups_document_id_documents_id_fk'
  ) THEN
    ALTER TABLE public.documents_doc_groups
      ADD CONSTRAINT documents_doc_groups_document_id_documents_id_fk
      FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_doc_groups_doc_group_id_doc_groups_id_fk'
  ) THEN
    ALTER TABLE public.documents_doc_groups
      ADD CONSTRAINT documents_doc_groups_doc_group_id_doc_groups_id_fk
      FOREIGN KEY (doc_group_id) REFERENCES public.doc_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
