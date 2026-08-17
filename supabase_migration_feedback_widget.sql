-- ============================================================
-- Nudge Expense Tracker — "Share feedback" widget
-- Run in: Supabase Dashboard → SQL Editor
--
-- New table for the floating feedback drawer (bug/feature/general
-- feedback with optional screenshot). Purely additive, safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS time_frame text,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS page_url text,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS browser_info text,
  ADD COLUMN IF NOT EXISTS screen_resolution text,
  ADD COLUMN IF NOT EXISTS screenshot_path text,
  ADD COLUMN IF NOT EXISTS submitter_name text,
  ADD COLUMN IF NOT EXISTS submitter_email text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_all ON feedback;
CREATE POLICY feedback_all ON feedback FOR ALL USING (true) WITH CHECK (true);

-- Screenshot storage — private bucket, accessed via signed URLs only,
-- same pattern as expense-documents/pr-quotes/po-pdfs/vendor-documents.
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS feedback_screenshots_all ON storage.objects;
CREATE POLICY feedback_screenshots_all ON storage.objects FOR ALL
  USING (bucket_id = 'feedback-screenshots')
  WITH CHECK (bucket_id = 'feedback-screenshots');
