-- Advances as running balances: one advance can be drawn on by several reports,
-- and one report can draw on several advances. report_advances holds how much of
-- each advance a report took; what is left is the advance minus those rows.
-- Also: the employee's answer when they have an open advance but said the report
-- is not related to one, and which advances an "Advance Adjustment" expense uses.

CREATE TABLE IF NOT EXISTS report_advances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  advance_id  uuid NOT NULL REFERENCES advances(id),
  amount      numeric NOT NULL CHECK (amount >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, advance_id)
);
CREATE INDEX IF NOT EXISTS report_advances_advance_idx ON report_advances (advance_id);
ALTER TABLE report_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_advances_all ON report_advances;
CREATE POLICY report_advances_all ON report_advances FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS advance_choice text;          -- 'deduct' | 'no'
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS advance_choice_reason text;   -- optional, when 'no'
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS advance_applied numeric;      -- part of the net settled from advances
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS settle_advance_ids uuid[];

-- Reports already tied to an advance keep counting against it. Their payout is
-- left exactly as it was (advance_applied stays empty); only new reports reduce
-- the amount reimbursed by what came from the advance.
INSERT INTO report_advances (report_id, advance_id, amount)
SELECT r.id, r.advance_id, LEAST(COALESCE(r.total_amount, 0), a.amount)
  FROM expense_reports r
  JOIN advances a ON a.id = r.advance_id
 WHERE r.advance_id IS NOT NULL AND r.status NOT IN ('draft', 'rejected')
ON CONFLICT DO NOTHING;
