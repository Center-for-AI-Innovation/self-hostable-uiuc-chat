-- Match Original DB Schema: cascade junction deletes when a document (or group) is
-- removed so trg_update_doc_count_after_insert keeps doc_groups.doc_count in sync.
--
-- Existing self-hosted DBs may have orphaned junction rows and drifted
-- doc_count. Order matters:
--   1. Disable the count trigger (orphan DELETEs would otherwise push already-
--      wrong counts further negative)
--   2. Delete orphaned junction rows
--   3. Recompute doc_count from the junction table
--   4. Re-enable the trigger
--   5. Add the FK constraints

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_update_doc_count_after_insert'
      AND tgrelid = 'public.documents_doc_groups'::regclass
  ) THEN
    ALTER TABLE "documents_doc_groups" DISABLE TRIGGER trg_update_doc_count_after_insert;
  END IF;
END $$;
--> statement-breakpoint

DELETE FROM "documents_doc_groups" ddg
WHERE NOT EXISTS (
  SELECT 1 FROM "documents" d WHERE d.id = ddg.document_id
);
--> statement-breakpoint
DELETE FROM "documents_doc_groups" ddg
WHERE NOT EXISTS (
  SELECT 1 FROM "doc_groups" dg WHERE dg.id = ddg.doc_group_id
);
--> statement-breakpoint

UPDATE "doc_groups" dg
SET doc_count = (
  SELECT COUNT(*) FROM "documents_doc_groups" ddg WHERE ddg.doc_group_id = dg.id
);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_update_doc_count_after_insert'
      AND tgrelid = 'public.documents_doc_groups'::regclass
  ) THEN
    ALTER TABLE "documents_doc_groups" ENABLE TRIGGER trg_update_doc_count_after_insert;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_doc_groups_document_id_documents_id_fk'
  ) THEN
    ALTER TABLE "documents_doc_groups"
      ADD CONSTRAINT "documents_doc_groups_document_id_documents_id_fk"
      FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_doc_groups_doc_group_id_doc_groups_id_fk'
  ) THEN
    ALTER TABLE "documents_doc_groups"
      ADD CONSTRAINT "documents_doc_groups_doc_group_id_doc_groups_id_fk"
      FOREIGN KEY ("doc_group_id") REFERENCES "public"."doc_groups"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
