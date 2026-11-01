-- Settings > Custom Approval could not work: approval_rules had row level security
-- switched on but no policy, so the app could neither read the rules nor save
-- changes (it silently fell back to the built-in route). This gives the table the
-- same open access every other table in the app has; who may edit the rules is
-- decided by the app (Settings, admin and Finance). The three rules already in the
-- table match today's route, so turning them on does not change how reports are routed.
DROP POLICY IF EXISTS approval_rules_all ON approval_rules;
CREATE POLICY approval_rules_all ON approval_rules FOR ALL USING (true) WITH CHECK (true);
