-- Gates expense report approvals by level, mirroring pr_approvals.required_role
-- (see PRDetail.jsx) — reporting_manager stays on the coarse fallback (no
-- natural 1:1 role in the roster), functional_lead maps to 'fl', coo maps to
-- the new 'coo' role. Existing rows stay NULL (coarse fallback), no backfill.
ALTER TABLE report_approvals ADD COLUMN IF NOT EXISTS required_role text;

-- Per-person "Reset Analytics" marker (Settings > Team & Roles). Personal
-- analytics queries only count activity after this timestamp for that
-- person; resetting never touches real pr_approvals/vendors/report_approvals
-- history, only bumps this marker.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS analytics_reset_at timestamptz;
