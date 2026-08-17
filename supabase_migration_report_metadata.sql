-- ============================================================
-- Nudge Expense Tracker — "New Report" modal + report-linked expenses
-- Run in: Supabase Dashboard → SQL Editor
--
-- Adds report-level metadata (Business Purpose, Duration) captured by the
-- "New Report" modal at report-creation time, plus a soft link from an
-- individual expense back to the report it was created against (used by
-- the "Report" dropdown in Add Expense to auto-fill Entity/classification).
--
-- Purely additive (ADD COLUMN IF NOT EXISTS) — safe to re-run.
-- ============================================================

ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS business_purpose text,
  ADD COLUMN IF NOT EXISTS duration_start date,
  ADD COLUMN IF NOT EXISTS duration_end date;

ALTER TABLE expense_details
  ADD COLUMN IF NOT EXISTS report_id uuid;
