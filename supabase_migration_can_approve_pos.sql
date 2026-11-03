-- Who can approve purchase orders: a switch per Finance team member, like can_approve_vendors.
-- Until now every Finance team member could approve POs, so the switch is first turned ON for all of
-- them (done before the log function is updated, so it does not write a line per person). An admin
-- then unticks anyone who should not approve POs in Settings, Team & Roles.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS can_approve_pos boolean NOT NULL DEFAULT false;
UPDATE team_members SET can_approve_pos = true WHERE role = 'finance';

-- The team log now also records PO approval being given or taken away.
CREATE OR REPLACE FUNCTION public.log_team_member_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      CASE WHEN NEW.can_approve_pos IS DISTINCT FROM OLD.can_approve_pos THEN concat('PO approval ', CASE WHEN NEW.can_approve_pos THEN 'given' ELSE 'taken away' END) END,
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
END $function$;

INSERT INTO system_logs (category, action, target, detail, actor_email, source)
SELECT 'team', 'po_approval_switched_on', 'Finance team',
       'PO approval switched on for ' || count(*) || ' Finance team members, who could approve POs before this switch existed.',
       'migration', 'database'
FROM team_members WHERE role = 'finance';
