-- Line-by-line vouching by the Finance team: every tick, flag, query and reply
-- on an expense inside a report is one row here, so each line keeps its own
-- thread. The current state of a line is simply its latest event.
-- Also stores a fingerprint of each receipt image so the same receipt filed
-- twice (by anyone) can be spotted.

CREATE TABLE IF NOT EXISTS expense_vouch_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL,
  expense_id    uuid NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('clear', 'flag', 'query', 'reply', 'reopen')),
  body          text,
  author_email  text,
  author_name   text,
  author_role   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_vouch_events_report_idx ON expense_vouch_events (report_id, created_at);
CREATE INDEX IF NOT EXISTS expense_vouch_events_expense_idx ON expense_vouch_events (expense_id, created_at);

ALTER TABLE expense_vouch_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expense_vouch_events_all" ON expense_vouch_events;
CREATE POLICY "expense_vouch_events_all" ON expense_vouch_events FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE expense_captures ADD COLUMN IF NOT EXISTS receipt_hash text;
CREATE INDEX IF NOT EXISTS expense_captures_receipt_hash_idx ON expense_captures (receipt_hash) WHERE receipt_hash IS NOT NULL;
