-- ============================================================
-- Nudge Expense Tracker — Migration
-- Run in: Supabase Dashboard → SQL Editor
--
-- Fixes: the vendor bank-detail-change-request feature (submitted from
-- VendorDetail.jsx → BankChangeRequest.jsx) inserts into
-- `vendor_bank_change_log` using the app's anon key (this app has no
-- Supabase Auth — see auth.js). That insert currently fails with:
--   "new row violates row-level security policy for table vendor_bank_change_log"
-- because RLS is enabled on this table with no policy permitting the
-- anon role to write. This grants the same anon-key trust model already
-- used by the app's other tables (e.g. expense_details, vendors).
-- ============================================================

ALTER TABLE vendor_bank_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_bank_change_log_all ON vendor_bank_change_log;
CREATE POLICY vendor_bank_change_log_all ON vendor_bank_change_log
  FOR ALL USING (true) WITH CHECK (true);
