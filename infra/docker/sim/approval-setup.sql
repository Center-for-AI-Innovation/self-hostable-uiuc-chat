-- Sim signup approval gate.
--
-- Upstream Sim has no approval workflow, so the gate lives in Sim's own
-- database: a side table of per-email decisions, enforced by triggers on
-- Sim's "user" and session state. Run by the sim-approval-setup service on
-- every stack start via psql, with approval_admin_email supplied by
--   psql --set=approval_admin_email=...
-- Idempotent: every statement tolerates re-running against an existing DB.
--
-- Three triggers, one per direction:
--   apply_sim_user_approval    BEFORE INSERT ON "user"    — new signups land
--     banned unless pre-approved; the bootstrap admin is promoted.
--   record_sim_user_approval   AFTER UPDATE  ON "user"    — admin ban/unban
--     actions in Sim's own UI are mirrored into the side table.
--   enforce_sim_user_approval  AFTER INSERT/UPDATE ON sim_user_approval —
--     decisions written to the side table are pushed onto the "user" row and
--     revoke live sessions, so flipping a row to 'blocked' takes effect
--     immediately instead of waiting for the next stack start.
-- The pg_trigger_depth() guards stop the mirror pair from feeding each other.

BEGIN;

CREATE TABLE IF NOT EXISTS sim_user_approval (
  email text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'blocked')),
  is_admin boolean NOT NULL DEFAULT false,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sim_user_approval (email, status, is_admin, reason)
VALUES (lower(:'approval_admin_email'), 'approved', true, NULL)
ON CONFLICT (email) DO UPDATE SET
  status = 'approved',
  is_admin = true,
  reason = NULL,
  updated_at = now();

INSERT INTO sim_user_approval (email, status, is_admin, reason)
VALUES (
  'sim-sso-provider@localhost.invalid',
  'blocked',
  false,
  'Internal SSO provider owner'
)
ON CONFLICT (email) DO UPDATE SET
  status = 'blocked',
  is_admin = false,
  reason = 'Internal SSO provider owner',
  updated_at = now();

INSERT INTO "user" (
  id,
  name,
  email,
  normalized_email,
  email_verified,
  created_at,
  updated_at,
  role,
  banned,
  ban_reason
)
VALUES (
  'sim-sso-provider-owner',
  'Sim SSO Provider',
  'sim-sso-provider@localhost.invalid',
  'sim-sso-provider@localhost.invalid',
  true,
  now(),
  now(),
  'user',
  true,
  'Internal SSO provider owner'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO sim_user_approval (email, status, is_admin, reason)
SELECT
  lower(email),
  CASE WHEN lower(email) = lower(:'approval_admin_email') THEN 'approved' ELSE 'pending' END,
  lower(email) = lower(:'approval_admin_email'),
  CASE
    WHEN lower(email) = lower(:'approval_admin_email') THEN NULL
    ELSE 'Pending admin approval'
  END
FROM "user"
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION apply_sim_user_approval()
RETURNS trigger AS $$
DECLARE
  approval sim_user_approval%ROWTYPE;
BEGIN
  INSERT INTO sim_user_approval (email, status, is_admin, reason)
  VALUES (lower(NEW.email), 'pending', false, 'Pending admin approval')
  ON CONFLICT (email) DO NOTHING;

  SELECT * INTO approval
  FROM sim_user_approval
  WHERE email = lower(NEW.email);

  NEW.banned := approval.status <> 'approved';
  NEW.ban_reason := CASE WHEN NEW.banned THEN approval.reason ELSE NULL END;
  NEW.ban_expires := NULL;
  IF approval.is_admin THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_sim_user_approval()
RETURNS trigger AS $$
BEGIN
  IF NEW.banned IS DISTINCT FROM OLD.banned THEN
    INSERT INTO sim_user_approval (email, status, is_admin, reason)
    VALUES (
      lower(NEW.email),
      CASE WHEN NEW.banned THEN 'blocked' ELSE 'approved' END,
      NEW.role = 'admin',
      CASE WHEN NEW.banned THEN NEW.ban_reason ELSE NULL END
    )
    ON CONFLICT (email) DO UPDATE SET
      status = excluded.status,
      reason = excluded.reason,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Revocation: a decision written to sim_user_approval is pushed onto the
-- "user" row it names, and a non-approved status ends the user's live
-- sessions. Without this the side table only gated *inserts* — flipping an
-- existing user to 'blocked' had no effect until the next stack start.
-- Skipped when fired from inside another trigger (the mirror above writing
-- back what an admin already did in Sim's UI, or the signup trigger seeding
-- a pending row while the "user" row does not exist yet).
CREATE OR REPLACE FUNCTION enforce_sim_user_approval()
RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  UPDATE "user" AS users
  SET
    role = CASE WHEN NEW.is_admin THEN 'admin' ELSE users.role END,
    banned = NEW.status <> 'approved',
    ban_reason = CASE WHEN NEW.status = 'approved' THEN NULL ELSE NEW.reason END,
    ban_expires = NULL
  WHERE lower(users.email) = NEW.email;

  IF NEW.status <> 'approved' THEN
    DELETE FROM session
    WHERE user_id IN (
      SELECT id FROM "user" WHERE lower(email) = NEW.email
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS record_sim_user_approval_on_user ON "user";

UPDATE "user" AS users
SET
  role = CASE WHEN approvals.is_admin THEN 'admin' ELSE users.role END,
  banned = approvals.status <> 'approved',
  ban_reason = CASE
    WHEN approvals.status = 'approved' THEN NULL
    ELSE approvals.reason
  END,
  ban_expires = NULL
FROM sim_user_approval AS approvals
WHERE lower(users.email) = approvals.email;

DELETE FROM session
WHERE user_id IN (
  SELECT users.id
  FROM "user" AS users
  JOIN sim_user_approval AS approvals ON approvals.email = lower(users.email)
  WHERE approvals.status <> 'approved'
);

DROP TRIGGER IF EXISTS apply_sim_user_approval_on_user ON "user";
CREATE TRIGGER apply_sim_user_approval_on_user
BEFORE INSERT ON "user"
FOR EACH ROW
EXECUTE FUNCTION apply_sim_user_approval();

CREATE TRIGGER record_sim_user_approval_on_user
AFTER UPDATE OF banned ON "user"
FOR EACH ROW
EXECUTE FUNCTION record_sim_user_approval();

DROP TRIGGER IF EXISTS enforce_sim_user_approval_on_approval ON sim_user_approval;
CREATE TRIGGER enforce_sim_user_approval_on_approval
AFTER INSERT OR UPDATE OF status, is_admin ON sim_user_approval
FOR EACH ROW
EXECUTE FUNCTION enforce_sim_user_approval();

COMMIT;
