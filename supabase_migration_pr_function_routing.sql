-- Per-Function FL approval routing. Function lives on the person
-- (team_members.function, admin-assigned in Settings), resolved once at PR
-- submission time onto that PR's own pr_approvals row (required_approver_email)
-- so a later change to someone's Function or the Function->FL mapping never
-- silently reroutes a PR that's already mid-flight. A null function or an
-- unresolvable one falls back to the existing any-fl-approves behavior.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS function text;
ALTER TABLE pr_approvals ADD COLUMN IF NOT EXISTS required_approver_email text;
