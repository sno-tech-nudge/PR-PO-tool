-- Approver delegation (out-of-office proxy): while a delegation is active, the
-- delegate can act on approvals the delegator could act on. The delegator's
-- role is snapshotted so role-only approval levels can be matched without a
-- join at check time. Admin is deliberately never delegable (enforced in the UI).
CREATE TABLE IF NOT EXISTS approval_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_email text NOT NULL,
  delegator_name text,
  delegator_role text NOT NULL,
  delegate_email text NOT NULL,
  delegate_name text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS approval_delegations_delegate_idx ON approval_delegations (lower(delegate_email));
ALTER TABLE approval_delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_delegations_all ON approval_delegations FOR ALL USING (true) WITH CHECK (true);

-- Append-only record of status changes, approval decisions and submissions
-- across PRs, POs, expense reports and vendors. Admin-only viewer: Activity Log.
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL, -- 'pr' | 'po' | 'report' | 'expense' | 'vendor'
  entity_id text NOT NULL,
  entity_ref text,
  action text NOT NULL,
  from_value text,
  to_value text,
  actor_email text,
  actor_name text,
  on_behalf_of text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity_type, entity_id);
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_log_all ON activity_log FOR ALL USING (true) WITH CHECK (true);

-- AI vouch-check verdict, persisted when Finance runs the check so the
-- Policy Violations dashboard can roll it up org-wide (no backfill).
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS ai_vouch_verdict text;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS ai_vouch_confidence text;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS ai_vouch_summary text;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS ai_vouch_checked_at timestamptz;

-- Rule-engine outcome per expense, saved when a report is submitted. The
-- existing policy_status column is overwritten with 'submitted' on every
-- report, so flags were previously never recoverable after submission.
-- Shape: [{ kind: 'violation'|'flag', rule, message, severity }]
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS policy_flags jsonb;
