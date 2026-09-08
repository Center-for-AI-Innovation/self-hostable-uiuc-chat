-- Remove the n8n tool integration. Sim AI replaced it; nothing reads
-- these objects any more (frontend routes, backend WorkflowService, and the
-- workflow-lock SQL functions were all deleted).

DROP FUNCTION IF EXISTS public.check_and_lock_flows_v2(integer);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.get_latest_workflow_id();--> statement-breakpoint
DROP FUNCTION IF EXISTS public.test_function(integer);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.increment_workflows() CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "n8n_workflows";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "n8n_api_key";
