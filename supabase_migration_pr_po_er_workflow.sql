-- ============================================================
-- Nudge Expense Tracker — Migration
-- Run in: Supabase Dashboard → SQL Editor
--
-- NOT YET RUN. This consolidates every schema gap discovered while building
-- the PR → PO → ER (tranche invoice) workflow expansion. None of these have
-- been applied — per standing instruction, this is a "flag it" migration,
-- not an auto-applied one. Review before running.
--
-- Zero real rows exist in purchase_requests/pr_approvals/purchase_orders as
-- of this writing (confirmed last session + re-confirmed this session), so
-- every change below — including the two RENAME COLUMNs — is safe with no
-- data-loss risk.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. purchase_requests — code writes these columns, live DB is missing them
--    (confirmed via REST insert-probe: PGRST204 "column not found")
-- ----------------------------------------------------------------
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS comparative_statement_path text;

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_requests_all ON purchase_requests;
CREATE POLICY purchase_requests_all ON purchase_requests
  FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------
-- 2. pr_approvals — live table has `level` (int) + `approver_role` (text),
--    code writes `approver_level` + `approver_name` throughout
--    (prApprovalActions.js). Renaming is safe (zero rows exist) and avoids
--    two redundant column pairs meaning the same thing.
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pr_approvals' AND column_name = 'level')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pr_approvals' AND column_name = 'approver_level') THEN
    ALTER TABLE pr_approvals RENAME COLUMN level TO approver_level;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pr_approvals' AND column_name = 'approver_role')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pr_approvals' AND column_name = 'approver_name') THEN
    ALTER TABLE pr_approvals RENAME COLUMN approver_role TO approver_name;
  END IF;
END $$;

ALTER TABLE pr_approvals ADD COLUMN IF NOT EXISTS actioned_at timestamptz;
ALTER TABLE pr_approvals ADD COLUMN IF NOT EXISTS approver_email text;
ALTER TABLE pr_approvals ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE pr_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_approvals_all ON pr_approvals;
CREATE POLICY pr_approvals_all ON pr_approvals
  FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------
-- 3. purchase_orders — more severely broken than previously known. Even
--    `status`, an EXISTING feature this app's Mark Completed/Cancel PO
--    buttons already rely on, does not exist live
--    (confirmed via `SELECT status` → 42703 "column does not exist").
--    id/pr_id/vendor_id/amount/generated_at DO exist (confirmed via
--    type-cast errors on insert-probe); po_number exists but is RLS-blocked.
-- ----------------------------------------------------------------
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending_approval';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS entity text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pdf_storage_path text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_all ON purchase_orders;
CREATE POLICY purchase_orders_all ON purchase_orders
  FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------
-- 4. expense_reports — new column for the ER-from-PO tranche flow
--    (SubmitPOExpense.jsx). `pr_id` already exists and is unaffected
--    (used by linkEngine.js's separate fuzzy/manual PR↔ER linking).
-- ----------------------------------------------------------------
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES purchase_orders(id);

-- ----------------------------------------------------------------
-- 5. Storage buckets used by this workflow — create if missing (private,
--    matches the existing pr-quotes/vendor-documents/po-pdfs convention).
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('po-pdfs', 'po-pdfs', false)
ON CONFLICT (id) DO NOTHING;
