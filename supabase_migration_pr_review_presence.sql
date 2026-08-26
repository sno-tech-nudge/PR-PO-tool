-- Advisory "someone else is already reviewing this PR" presence tracking.
-- One row per (pr_id, viewer_email); heartbeated every ~15s while an
-- eligible approver has the PR detail page open, deleted on unmount.
-- Never used to block an action — purely informational, matches every
-- other table's RLS posture in this app (anon-key-trusted, no backend).
CREATE TABLE IF NOT EXISTS pr_review_presence (
  pr_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  viewer_email text NOT NULL,
  viewer_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pr_id, viewer_email)
);

ALTER TABLE pr_review_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY pr_review_presence_all ON pr_review_presence
  FOR ALL USING (true) WITH CHECK (true);
