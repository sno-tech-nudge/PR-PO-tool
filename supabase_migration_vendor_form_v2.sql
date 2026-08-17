-- ============================================================
-- Nudge Expense Tracker — Vendor management: Aadhaar (individual
-- vendors), related-party disclosure, nature of business, draft support
-- Run in: Supabase Dashboard → SQL Editor (or via direct DDL access)
--
-- Purely additive — safe to re-run.
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS aadhaar_number               text,
  ADD COLUMN IF NOT EXISTS aadhaar_copy_path             text,
  ADD COLUMN IF NOT EXISTS aadhaar_pan_linked            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aadhaar_pan_link_proof_path   text,
  ADD COLUMN IF NOT EXISTS is_related_to_org             boolean,
  ADD COLUMN IF NOT EXISTS related_org_description       text,
  ADD COLUMN IF NOT EXISTS nature_of_business            text,
  ADD COLUMN IF NOT EXISTS created_at                    timestamptz;

-- Backfill created_at for existing rows so list ordering has a value to
-- sort on even for rows submitted before this column existed.
UPDATE vendors SET created_at = COALESCE(submitted_at, now()) WHERE created_at IS NULL;
ALTER TABLE vendors ALTER COLUMN created_at SET DEFAULT now();
