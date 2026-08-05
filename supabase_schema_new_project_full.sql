-- ============================================================
-- Nudge Expense Tracker — complete schema for a brand-new Supabase project
-- Run in: Supabase Dashboard → SQL Editor (new project: jwfakokotahptzfeemrz)
--
-- This app has no Supabase Auth — every table is trusted at the anon-key
-- level, so every table below gets a permissive RLS policy (FOR ALL USING
-- (true) WITH CHECK (true)). This matches how the app has always worked.
--
-- Core tables (expense_reports/expense_details/report_expenses/
-- report_approvals/expense_notifications/vendors) are reverse-engineered
-- from real exported rows in db_export_backup/ (the old project), so the
-- column set/types here exactly match live data about to be re-imported.
-- expense_captures and vendor_bank_change_log had zero rows in the old
-- project, so those two are derived from the app code's insert payloads
-- instead (NewExpense.jsx, BankChangeRequest.jsx).
--
-- Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================

-- ─── expense_reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_reference text,
  employee_id uuid,
  brand text,
  total_amount numeric,
  expense_count integer,
  approval_route text,
  status text DEFAULT 'submitted',
  submitted_at timestamptz,
  approved_at timestamptz,
  reimbursed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  pdf_storage_path text,
  selected_expense_ids jsonb,
  approver_notes text,
  rejected_at timestamptz,
  rejection_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  vouched_at timestamptz,
  vouched_by text,
  finance_notes text,
  employee_email text,
  pr_id uuid,
  link_confidence text,
  po_id uuid
);

ALTER TABLE expense_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_reports_all ON expense_reports;
CREATE POLICY expense_reports_all ON expense_reports FOR ALL USING (true) WITH CHECK (true);

-- ─── expense_details ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id uuid,
  amount numeric,
  vendor text,
  date text,
  category text,
  expense_type text,
  attendee_count integer,
  per_person_amount numeric,
  attendee_names text,
  purpose_type text,
  description text,
  trip_related boolean DEFAULT false,
  trip_name text,
  prior_approval_taken boolean,
  prior_approval_reference text,
  brand text,
  reimbursement_type text,
  payment_method text,
  status text DEFAULT 'saved',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  policy_status text,
  policy_violations jsonb,
  policy_flags jsonb,
  approval_route text,
  invoice_number text,
  gstin text,
  user_id uuid,
  user_email text,
  vendor_id uuid
);

ALTER TABLE expense_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_details_all ON expense_details;
CREATE POLICY expense_details_all ON expense_details FOR ALL USING (true) WITH CHECK (true);

-- ─── report_expenses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES expense_reports(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES expense_details(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_expenses_all ON report_expenses;
CREATE POLICY report_expenses_all ON report_expenses FOR ALL USING (true) WITH CHECK (true);

-- ─── report_approvals ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES expense_reports(id) ON DELETE CASCADE,
  approver_level text,
  approver_name text,
  approver_email text,
  status text DEFAULT 'waiting',
  notes text,
  actioned_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_approvals_all ON report_approvals;
CREATE POLICY report_approvals_all ON report_approvals FOR ALL USING (true) WITH CHECK (true);

-- ─── expense_notifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text,
  report_id uuid REFERENCES expense_reports(id) ON DELETE CASCADE,
  type text,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expense_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_notifications_all ON expense_notifications;
CREATE POLICY expense_notifications_all ON expense_notifications FOR ALL USING (true) WITH CHECK (true);

-- ─── expense_captures ───────────────────────────────────────────────────────
-- Zero rows in the old project, so derived from NewExpense.jsx's insert shape.
CREATE TABLE IF NOT EXISTS expense_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_storage_path text,
  payment_storage_path text,
  receipt_extracted_amount numeric,
  receipt_extracted_vendor text,
  receipt_extracted_date text,
  payment_extracted_amount numeric,
  payment_extracted_transaction_id text,
  payment_is_upi boolean,
  payment_app text,
  amounts_match boolean,
  quality_override boolean DEFAULT false,
  captured_offline boolean DEFAULT false,
  single_document boolean DEFAULT false,
  status text DEFAULT 'captured',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expense_captures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_captures_all ON expense_captures;
CREATE POLICY expense_captures_all ON expense_captures FOR ALL USING (true) WITH CHECK (true);

-- ─── vendors ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text,
  org_name text,
  pan_number text,
  gstin text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  pincode text,
  bank_name text,
  account_number text,
  ifsc_code text,
  account_holder_name text,
  cancelled_cheque_url text,
  pan_document_url text,
  status text DEFAULT 'pending',
  submitted_by text,
  submitted_at timestamptz DEFAULT now(),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  org_type text,
  contact_person text,
  website text,
  address_line1 text,
  address_line2 text,
  country text DEFAULT 'India',
  date_of_incorporation date,
  org_registration_number text,
  org_registration_state text,
  is_msme boolean DEFAULT false,
  is_gstin_registered boolean DEFAULT false,
  beneficiary_name text,
  branch text,
  cancelled_cheque_path text,
  pan_copy_path text,
  msme_details text,
  msme_certificate_path text,
  gst_certificate_path text,
  registration_certificate_path text
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_all ON vendors;
CREATE POLICY vendors_all ON vendors FOR ALL USING (true) WITH CHECK (true);

-- ─── vendor_bank_change_log ─────────────────────────────────────────────────
-- Zero rows in the old project, so derived from BankChangeRequest.jsx's insert shape.
CREATE TABLE IF NOT EXISTS vendor_bank_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  requested_by text,
  old_account_number text,
  new_account_number text,
  old_ifsc_code text,
  new_ifsc_code text,
  old_bank_name text,
  new_bank_name text,
  status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_bank_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_bank_change_log_all ON vendor_bank_change_log;
CREATE POLICY vendor_bank_change_log_all ON vendor_bank_change_log FOR ALL USING (true) WITH CHECK (true);

-- ─── purchase_requests ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  pr_number text,
  vendor_id uuid REFERENCES vendors(id),
  requested_by text,
  amount numeric,
  base_amount numeric,
  tax_amount numeric,
  gst_amount numeric,
  incidental_amount numeric,
  budgeted boolean,
  category text,
  expense_type text,
  entity text,
  donor_name text,
  program text,
  subprogram text,
  donor_allocations jsonb,
  purpose text,
  is_recurring boolean DEFAULT false,
  recurring_frequency text,
  quotes jsonb,
  quote_paths jsonb,
  single_source_justification text,
  comparative_statement_path text,
  advance_percent numeric,
  after_delivery_percent numeric,
  advance_fl_email_ack boolean DEFAULT false,
  status text DEFAULT 'submitted',
  submitted_at timestamptz,
  ai_summary text,
  rejection_reason text,
  linked_expense_report_id uuid REFERENCES expense_reports(id),
  link_confidence text
);

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_requests_all ON purchase_requests;
CREATE POLICY purchase_requests_all ON purchase_requests FOR ALL USING (true) WITH CHECK (true);

-- ─── pr_approvals ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pr_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  pr_id uuid REFERENCES purchase_requests(id) ON DELETE CASCADE,
  approver_level integer,
  approver_name text,
  approver_email text,
  status text DEFAULT 'waiting',
  actioned_at timestamptz,
  rejection_reason text
);

ALTER TABLE pr_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_approvals_all ON pr_approvals;
CREATE POLICY pr_approvals_all ON pr_approvals FOR ALL USING (true) WITH CHECK (true);

-- ─── purchase_orders ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  po_number text,
  pr_id uuid REFERENCES purchase_requests(id),
  vendor_id uuid REFERENCES vendors(id),
  amount numeric,
  entity text,
  status text DEFAULT 'pending_approval',
  generated_at timestamptz DEFAULT now(),
  pdf_storage_path text,
  approved_by text,
  approved_at timestamptz,
  rejection_reason text
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_all ON purchase_orders;
CREATE POLICY purchase_orders_all ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

-- Now that both tables exist, wire the FK expense_reports.po_id → purchase_orders.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'expense_reports_po_id_fkey'
  ) THEN
    ALTER TABLE expense_reports
      ADD CONSTRAINT expense_reports_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id);
  END IF;
END $$;

-- ─── Storage buckets ────────────────────────────────────────────────────────
-- expense-documents: receipts/payment proof (NewExpense.jsx, SubmitPOExpense.jsx)
-- pr-quotes / po-pdfs / vendor-documents: PR/PO/vendor module uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-documents', 'expense-documents', false),
       ('pr-quotes', 'pr-quotes', false),
       ('po-pdfs', 'po-pdfs', false),
       ('vendor-documents', 'vendor-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS nudge_buckets_all ON storage.objects;
CREATE POLICY nudge_buckets_all ON storage.objects FOR ALL
  USING (bucket_id IN ('expense-documents', 'pr-quotes', 'po-pdfs', 'vendor-documents'))
  WITH CHECK (bucket_id IN ('expense-documents', 'pr-quotes', 'po-pdfs', 'vendor-documents'));
