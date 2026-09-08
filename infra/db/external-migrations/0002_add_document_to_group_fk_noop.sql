-- 0002_add_document_to_group_fk_noop.sql
--
-- External-store port of apps/frontend/src/db/migrations/
-- 0014_add_document_to_group_fk_noop.sql.
--
-- Swallow foreign_key_violation in add_document_to_group{,_url} when a document
-- (or group) is deleted between resolve and junction insert. Before 0001 that
-- race left an orphan; with ON DELETE CASCADE FKs in place it fails ingest
-- instead. Treat it as a logged no-op.
--
-- Bodies must stay identical to the ones in
-- infra/db/provision_external_pgvector_store.sql. Safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.add_document_to_group(p_course_name text, p_s3_path text, p_url text, p_readable_filename text, p_doc_groups text[]) RETURNS boolean
    LANGUAGE plpgsql
    AS $$DECLARE
    v_document_id bigint;
    v_doc_group_id bigint;
    v_success boolean := true;
    p_doc_group text;
BEGIN
    -- Ensure the document exists
    SELECT id INTO v_document_id FROM public.documents WHERE course_name = p_course_name AND (
    (s3_path <> '' AND s3_path IS NOT NULL AND s3_path = p_s3_path)
);

    raise log 'id of document: %', v_document_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Document does not exist';
    END IF;

    -- Loop through document groups
    FOREACH p_doc_group IN ARRAY p_doc_groups
    LOOP
        -- Upsert document group, assuming 'name' and 'course_name' can uniquely identify a row
        INSERT INTO public.doc_groups(name, course_name)
        VALUES (p_doc_group, p_course_name)
        ON CONFLICT (name, course_name) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING id INTO v_doc_group_id;

        raise log 'id of document group: %', v_doc_group_id;

        -- Upsert the association in documents_doc_groups.
        -- Concurrent delete between SELECT and INSERT: no-op (do not fail ingest).
        BEGIN
            INSERT INTO public.documents_doc_groups(document_id, doc_group_id)
            VALUES (v_document_id, v_doc_group_id)
            ON CONFLICT (document_id, doc_group_id) DO NOTHING;
        EXCEPTION
            WHEN foreign_key_violation THEN
                RAISE LOG 'add_document_to_group: skipping FK violation for document_id=% doc_group_id=%',
                    v_document_id, v_doc_group_id;
        END;

        raise log 'completed for %',v_doc_group_id;
    END LOOP;

    raise log 'completed for %',v_document_id;
    RETURN v_success;
EXCEPTION
    WHEN OTHERS THEN
        v_success := false;
        RAISE;
        RETURN v_success;
END;$$;

CREATE OR REPLACE FUNCTION public.add_document_to_group_url(p_course_name text, p_s3_path text, p_url text, p_readable_filename text, p_doc_groups text[]) RETURNS boolean
    LANGUAGE plpgsql
    AS $$DECLARE
    v_document_id bigint;
    v_doc_group_id bigint;
    v_success boolean := true;
    p_doc_group text;
BEGIN
    -- Ensure the document exists
    SELECT id INTO v_document_id FROM public.documents WHERE course_name = p_course_name AND (
    (s3_path <> '' AND s3_path IS NOT NULL AND s3_path = p_s3_path) OR
    (url = p_url)
);

    raise log 'id of document: %', v_document_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Document does not exist';
    END IF;

    -- Loop through document groups
    FOREACH p_doc_group IN ARRAY p_doc_groups
    LOOP
        -- Upsert document group, assuming 'name' and 'course_name' can uniquely identify a row
        INSERT INTO public.doc_groups(name, course_name)
        VALUES (p_doc_group, p_course_name)
        ON CONFLICT (name, course_name) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING id INTO v_doc_group_id;

        raise log 'id of document group: %', v_doc_group_id;

        -- Upsert the association in documents_doc_groups.
        -- Concurrent delete between SELECT and INSERT: no-op (do not fail ingest).
        BEGIN
            INSERT INTO public.documents_doc_groups(document_id, doc_group_id)
            VALUES (v_document_id, v_doc_group_id)
            ON CONFLICT (document_id, doc_group_id) DO NOTHING;
        EXCEPTION
            WHEN foreign_key_violation THEN
                RAISE LOG 'add_document_to_group_url: skipping FK violation for document_id=% doc_group_id=%',
                    v_document_id, v_doc_group_id;
        END;

        raise log 'completed for %',v_doc_group_id;
    END LOOP;

    raise log 'completed for %',v_document_id;
    RETURN v_success;
EXCEPTION
    WHEN OTHERS THEN
        v_success := false;
        RAISE;
        RETURN v_success;
END;$$;

COMMIT;
