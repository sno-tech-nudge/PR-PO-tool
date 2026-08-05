-- ============================================================
-- Nudge Expense Tracker — PR / PO / Vendor module — complete schema fix
-- Run in: Supabase Dashboard → SQL Editor (project referenced by VITE_SUPABASE_URL)
--
-- Context: this app has no Supabase Auth — every table is trusted at the
-- anon-key level (same model expense_reports/expense_details/etc. already
-- use in production). The PR/PO/vendor tables were left over from an
-- earlier ("Lovable") build and drifted from what the current app code
-- expects: several columns the code reads/writes don't exist, and RLS
-- blocks anon writes on purchase_requests/pr_approvals/purchase_orders.
--
-- This script is purely additive and safe to re-run:
--   - CREATE TABLE IF NOT EXISTS — only fires if a table is fully missing.
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS — adds whatever's missing
--     on a table that already exists, without touching existing rows.
--   - Nothing is renamed or dropped, so any old/leftover columns from the
--     previous build are left alone (harmless clutter, zero data risk).
--   - RLS policies are DROP POLICY IF EXISTS + CREATE, so re-running is
--     idempotent.
-- Does NOT touch expense_reports / expense_details / report_expenses /
-- report_approvals / expense_captures / expense_notifications — those are
-- alive and already used by this app in production.
-- ============================================================

-- ─── vendors ──────────────────────────────────────────────────────────────
-- Read/written by VendorForm.jsx, VendorList.jsx, VendorDetail.jsx,
-- VendorApprovalView.jsx, VendorSearch.jsx, VendorSelector.jsx, and
-- referenced via FK from purchase_requests.vendor_id / purchase_orders.vendor_id.

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_id text,
  ADD COLUMN IF NOT EXISTS org_name text,
  ADD COLUMN IF NOT EXISTS org_type text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS date_of_incorporation date,
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS is_msme boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS msme_details text,
  ADD COLUMN IF NOT EXISTS msme_certificate_path text,
  ADD COLUMN IF NOT EXISTS is_gstin_registered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS gst_certificate_path text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS org_registration_number text,
  ADD COLUMN IF NOT EXISTS org_registration_state text,
  ADD COLUMN IF NOT EXISTS beneficiary_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS cancelled_cheque_path text,
  ADD COLUMN IF NOT EXISTS pan_copy_path text,
  ADD COLUMN IF NOT EXISTS registration_certificate_path text,
  ADD COLUMN IF NOT EXISTS submitted_by text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_all ON vendors;
CREATE POLICY vendors_all ON vendors FOR ALL USING (true) WITH CHECK (true);

-- ─── vendor_bank_change_log ────────────────────────────────────────────────
-- Written by BankChangeRequest.jsx (a vendor's request to change their
-- payout bank details, reviewed separately from the vendor record itself).

CREATE TABLE IF NOT EXISTS vendor_bank_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_bank_change_log
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS requested_by text,
  ADD COLUMN IF NOT EXISTS old_account_number text,
  ADD COLUMN IF NOT EXISTS new_account_number text,
  ADD COLUMN IF NOT EXISTS old_ifsc_code text,
  ADD COLUMN IF NOT EXISTS new_ifsc_code text,
  ADD COLUMN IF NOT EXISTS old_bank_name text,
  ADD COLUMN IF NOT EXISTS new_bank_name text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

ALTER TABLE vendor_bank_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_bank_change_log_all ON vendor_bank_change_log;
CREATE POLICY vendor_bank_change_log_all ON vendor_bank_change_log FOR ALL USING (true) WITH CHECK (true);

-- ─── purchase_requests ──────────────────────────────────────────────────────
-- Written by PRForm.jsx, read by PRList.jsx / PRDetail.jsx /
-- PRApproverDashboard.jsx / PRApproverView.jsx / linkEngine.js. This is the
-- table behind the "Could not find comparative_statement_path" error.

CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS pr_number text,
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id),
  ADD COLUMN IF NOT EXISTS requested_by text,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS base_amount numeric,
  ADD COLUMN IF NOT EXISTS tax_amount numeric,
  ADD COLUMN IF NOT EXISTS gst_amount numeric,
  ADD COLUMN IF NOT EXISTS incidental_amount numeric,
  ADD COLUMN IF NOT EXISTS budgeted boolean,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS expense_type text,
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS donor_name text,
  ADD COLUMN IF NOT EXISTS program text,
  ADD COLUMN IF NOT EXISTS subprogram text,
  ADD COLUMN IF NOT EXISTS donor_allocations jsonb,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_frequency text,
  ADD COLUMN IF NOT EXISTS quotes jsonb,
  ADD COLUMN IF NOT EXISTS quote_paths jsonb,
  ADD COLUMN IF NOT EXISTS single_source_justification text,
  ADD COLUMN IF NOT EXISTS comparative_statement_path text,
  ADD COLUMN IF NOT EXISTS advance_percent numeric,
  ADD COLUMN IF NOT EXISTS after_delivery_percent numeric,
  ADD COLUMN IF NOT EXISTS advance_fl_email_ack boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS linked_expense_report_id uuid REFERENCES expense_reports(id),
  ADD COLUMN IF NOT EXISTS link_confidence text;

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_requests_all ON purchase_requests;
CREATE POLICY purchase_requests_all ON purchase_requests FOR ALL USING (true) WITH CHECK (true);

-- ─── pr_approvals ───────────────────────────────────────────────────────────
-- Multi-level approval chain for a PR (Functional Leader, then COO above
-- ₹2L), written/read by PRForm.jsx, prApprovalActions.js, PRApproverView.jsx.
-- NOTE: approver_level here is the numeric level (1, 2 ...) per
-- getPRApprovalLevels(), not a role string — different convention from
-- report_approvals.approver_level (which stores a role key). Intentional,
-- matches PRForm.jsx's actual insert shape.

CREATE TABLE IF NOT EXISTS pr_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pr_approvals
  ADD COLUMN IF NOT EXISTS pr_id uuid REFERENCES purchase_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS approver_level integer,
  ADD COLUMN IF NOT EXISTS approver_name text,
  ADD COLUMN IF NOT EXISTS approver_email text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS actioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE pr_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_approvals_all ON pr_approvals;
CREATE POLICY pr_approvals_all ON pr_approvals FOR ALL USING (true) WITH CHECK (true);

-- ─── purchase_orders ────────────────────────────────────────────────────────
-- Created once a PR is fully approved (createPendingPO), gated behind an
-- explicit Finance approval (approvePO/rejectPO) before it's "issued".
-- One PR can have multiple POs (amount-sum allocation, see PRDetail.jsx).

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS pr_id uuid REFERENCES purchase_requests(id),
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id),
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS generated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_all ON purchase_orders;
CREATE POLICY purchase_orders_all ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

-- ─── expense_reports.po_id ──────────────────────────────────────────────────
-- New FK for the tranche-ER-from-PO flow (SubmitPOExpense.jsx). Additive
-- only — does not touch any existing expense_reports row or column.

ALTER TABLE expense_reports
  ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES purchase_orders(id);

-- ─── Storage buckets ────────────────────────────────────────────────────────
-- pr-quotes / po-pdfs / vendor-documents are referenced throughout the PR/PO
-- module (QuoteUpload.jsx, PRAttachmentsModal.jsx, prApprovalActions.js,
-- VendorForm.jsx, VendorApprovalView.jsx) but may not exist yet. Created
-- private (public = false); the app always accesses files via short-lived
-- signed URLs (createSignedUrl), same pattern as the existing
-- expense-documents bucket — never via a public URL.

INSERT INTO storage.buckets (id, name, public)
VALUES ('pr-quotes', 'pr-quotes', false),
       ('po-pdfs', 'po-pdfs', false),
       ('vendor-documents', 'vendor-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS pr_po_vendor_buckets_all ON storage.objects;
CREATE POLICY pr_po_vendor_buckets_all ON storage.objects FOR ALL
  USING (bucket_id IN ('pr-quotes', 'po-pdfs', 'vendor-documents'))
  WITH CHECK (bucket_id IN ('pr-quotes', 'po-pdfs', 'vendor-documents'));
