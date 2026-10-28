-- System Logs: an append-only record of changes to the system itself, shown to
-- admins only. What goes in:
--   schema       a table, column, index or other database object created, changed or
--                dropped, with the statement that did it (recorded by the database)
--   team         a person added, removed, or their role or access changed (recorded by
--                the database, so changes made outside the app are caught too)
--   deployment   a new version of the app going live (recorded when it is first opened)
--   maintenance  maintenance mode started and ended, with who and for how long
--   download     a CSV file downloaded, by whom, and how many rows
-- Rows can be added but never changed or deleted: the table refuses updates, deletes
-- and truncation, and the app's database roles are not given those rights.

CREATE TABLE IF NOT EXISTS system_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  category    text NOT NULL,
  action      text NOT NULL,
  target      text,
  detail      text,
  actor_email text,
  actor_name  text,
  source      text NOT NULL DEFAULT 'app',   -- app | database | deploy
  ref         text,                          -- de-duplication key, e.g. a deployment's commit
  meta        jsonb
);
CREATE INDEX IF NOT EXISTS system_logs_created_idx ON system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_category_idx ON system_logs (category, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS system_logs_ref_uidx ON system_logs (category, ref) WHERE ref IS NOT NULL;

ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_logs_read ON system_logs;
DROP POLICY IF EXISTS system_logs_add ON system_logs;
CREATE POLICY system_logs_read ON system_logs FOR SELECT USING (true);
CREATE POLICY system_logs_add ON system_logs FOR INSERT WITH CHECK (true);
-- no UPDATE or DELETE policy exists, and the rights are taken away as well
REVOKE UPDATE, DELETE, TRUNCATE ON system_logs FROM anon, authenticated, PUBLIC;

-- Maintenance mode lives in one small state table.
CREATE TABLE IF NOT EXISTS system_state (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_state_all ON system_state;
CREATE POLICY system_state_all ON system_state FOR ALL USING (true) WITH CHECK (true);
INSERT INTO system_state (key, value) VALUES ('maintenance', '{"on": false}'::jsonb) ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Team: who was added, removed or had their role or access changed. The app
-- stamps changed_by and changed_at on the same statement; if they are missing or
-- stale the change is recorded as a direct database change.
-- ---------------------------------------------------------------------------
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS changed_by text;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS changed_at timestamptz;

CREATE OR REPLACE FUNCTION log_team_member_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  by_email text;
  by_name  text;
  src      text;
  act      text;
  det      text;
  tgt      text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.changed_by IS NOT NULL AND OLD.changed_at > now() - interval '15 seconds' THEN by_email := OLD.changed_by; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.changed_by IS NOT NULL AND NEW.changed_at > now() - interval '60 seconds' THEN by_email := NEW.changed_by; END IF;
  ELSE
    IF NEW.changed_by IS NOT NULL AND NEW.changed_at IS DISTINCT FROM OLD.changed_at AND NEW.changed_at > now() - interval '60 seconds' THEN by_email := NEW.changed_by; END IF;
  END IF;
  IF by_email IS NOT NULL THEN
    SELECT name INTO by_name FROM team_members WHERE lower(email) = lower(by_email) LIMIT 1;
    src := 'app';
  ELSE
    by_email := 'direct database change';
    src := 'database';
  END IF;

  IF TG_OP = 'INSERT' THEN
    act := 'member_added'; tgt := NEW.email;
    det := concat(NEW.name, ' added as ', NEW.role);
  ELSIF TG_OP = 'DELETE' THEN
    act := 'member_removed'; tgt := OLD.email;
    det := concat(OLD.name, ' removed (was ', OLD.role, ')');
  ELSE
    tgt := NEW.email;
    det := concat_ws('; ',
      CASE WHEN NEW.role IS DISTINCT FROM OLD.role THEN concat('role ', OLD.role, ' to ', NEW.role) END,
      CASE WHEN NEW.can_approve_vendors IS DISTINCT FROM OLD.can_approve_vendors THEN concat('vendor approval ', CASE WHEN NEW.can_approve_vendors THEN 'given' ELSE 'taken away' END) END,
      CASE WHEN NEW.function IS DISTINCT FROM OLD.function THEN concat('function ', coalesce(OLD.function, 'none'), ' to ', coalesce(NEW.function, 'none')) END,
      CASE WHEN NEW.name IS DISTINCT FROM OLD.name THEN concat('name ', OLD.name, ' to ', NEW.name) END,
      CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN concat('email ', OLD.email, ' to ', NEW.email) END
    );
    IF det = '' THEN RETURN NEW; END IF;      -- nothing worth recording (e.g. only the stamp changed)
    act := CASE WHEN NEW.role IS DISTINCT FROM OLD.role THEN 'role_changed' ELSE 'member_updated' END;
  END IF;

  INSERT INTO system_logs (category, action, target, detail, actor_email, actor_name, source)
  VALUES ('team', act, tgt, det, by_email, by_name, src);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- recording must never stop the change itself
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_members_system_log ON team_members;
CREATE TRIGGER team_members_system_log AFTER INSERT OR UPDATE OR DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION log_team_member_change();

-- ---------------------------------------------------------------------------
-- Schema: any database object in the public schema created, changed or dropped,
-- with the statement that did it. Both functions swallow their own errors so a
-- logging problem can never block a migration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_ddl_command() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    -- triggers and policies carry no schema of their own, so they are matched on the table they belong to
    IF (coalesce(r.schema_name, '') = 'public' OR r.object_identity ILIKE '% on public.%') AND NOT r.in_extension THEN
      INSERT INTO system_logs (category, action, target, detail, actor_email, source)
      VALUES ('schema', r.command_tag, r.object_identity, left(current_query(), 1500), session_user::text, 'database');
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION log_ddl_drop() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
    IF r.original AND (coalesce(r.schema_name, '') = 'public' OR r.object_identity ILIKE '% on public.%') AND NOT r.is_temporary THEN
      INSERT INTO system_logs (category, action, target, detail, actor_email, source)
      VALUES ('schema', 'DROP ' || upper(r.object_type), r.object_identity, left(current_query(), 1500), session_user::text, 'database');
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP EVENT TRIGGER IF EXISTS system_log_ddl;
CREATE EVENT TRIGGER system_log_ddl ON ddl_command_end EXECUTE FUNCTION log_ddl_command();
DROP EVENT TRIGGER IF EXISTS system_log_drop;
CREATE EVENT TRIGGER system_log_drop ON sql_drop EXECUTE FUNCTION log_ddl_drop();

-- ===== IMMUTABLE: from here the log can no longer be changed =====
CREATE OR REPLACE FUNCTION system_logs_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'System logs cannot be changed or deleted.';
END $$;

DROP TRIGGER IF EXISTS system_logs_no_change ON system_logs;
CREATE TRIGGER system_logs_no_change BEFORE UPDATE OR DELETE ON system_logs
  FOR EACH ROW EXECUTE FUNCTION system_logs_refuse();
DROP TRIGGER IF EXISTS system_logs_no_truncate ON system_logs;
CREATE TRIGGER system_logs_no_truncate BEFORE TRUNCATE ON system_logs
  FOR EACH STATEMENT EXECUTE FUNCTION system_logs_refuse();
