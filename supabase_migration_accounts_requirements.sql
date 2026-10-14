-- Accounts team requirements: vendor vs reimbursement payments, line deductions,
-- automatic TDS, work assignment, out-of-policy and PR/PO reasons, and the
-- invoice-vs-payment-proof choice. All additive; nothing existing changes.

-- 1. Vendor payments vs reimbursements ------------------------------------
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS payment_kind text;
UPDATE expense_reports
   SET payment_kind = CASE WHEN po_related IS TRUE OR report_reference LIKE 'TNIV%' THEN 'vendor' ELSE 'reimbursement' END
 WHERE payment_kind IS NULL;

-- 5. Work assignment -------------------------------------------------------
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS assigned_to_email text;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS assigned_to_name text;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
CREATE INDEX IF NOT EXISTS expense_reports_assigned_idx ON expense_reports (assigned_to_email) WHERE assigned_to_email IS NOT NULL;

-- 2. Deductions by the Accounts team, per line, and the report's net payable ---
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS deduction_amount numeric;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS deduction_reason text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS deduction_note text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS deducted_by text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS deducted_at timestamptz;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS net_payable numeric;

-- 3. TDS ---------------------------------------------------------------------
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS base_amount numeric;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS gst_amount numeric;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS other_amount numeric;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_status text;   -- applicable | not_applicable | review
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_section text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_rate numeric;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_amount numeric;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_note text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_set_by text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_set_at timestamptz;

CREATE TABLE IF NOT EXISTS tds_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section           text NOT NULL,
  label             text NOT NULL,
  categories        text[] NOT NULL DEFAULT '{}',
  payee_type        text NOT NULL DEFAULT 'any' CHECK (payee_type IN ('any', 'individual', 'other')),
  rate              numeric NOT NULL,
  no_pan_rate       numeric NOT NULL DEFAULT 20,
  single_threshold  numeric,
  annual_threshold  numeric,
  active            boolean NOT NULL DEFAULT true,
  source            text NOT NULL DEFAULT 'custom',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tds_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tds_rules_all ON tds_rules;
CREATE POLICY tds_rules_all ON tds_rules FOR ALL USING (true) WITH CHECK (true);

-- Starter rules from the standard provisions, for the Finance team to confirm or
-- change in Settings. Marked source = 'starter' so it is clear they are not yet
-- Finance's own.
INSERT INTO tds_rules (section, label, categories, payee_type, rate, no_pan_rate, single_threshold, annual_threshold, source, notes)
SELECT * FROM (VALUES
  ('194J', 'Professional and technical fees', ARRAY['Consultant Fee','Professional Fee','Retainership / Consultancy','Legal Fees'], 'any',        10::numeric, 20::numeric, NULL::numeric, 50000::numeric,  'starter', 'Standard rate 10% (2% for technical services). Threshold on payments to one vendor in the year.'),
  ('194C', 'Contractor and service work, individuals and HUF', ARRAY['Service','Courier','Housekeeping','Repairs and Maintenance','Leasehold Improvements'], 'individual', 1::numeric,  20::numeric, 30000::numeric, 100000::numeric, 'starter', 'Applies if one bill is over the single limit or the year total passes the annual limit.'),
  ('194C', 'Contractor and service work, others', ARRAY['Service','Courier','Housekeeping','Repairs and Maintenance','Leasehold Improvements'], 'other',      2::numeric,  20::numeric, 30000::numeric, 100000::numeric, 'starter', 'Applies if one bill is over the single limit or the year total passes the annual limit.')
) AS v(section, label, categories, payee_type, rate, no_pan_rate, single_threshold, annual_threshold, source, notes)
WHERE NOT EXISTS (SELECT 1 FROM tds_rules);

-- 7 and 8. Short reasons given only when something is out of policy or a
-- purchase over the limit has no PR/PO ----------------------------------------
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS policy_justification text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS no_po_reason text;

-- 6. Which amount the person chose when the invoice and proof of payment differed
ALTER TABLE expense_captures ADD COLUMN IF NOT EXISTS amount_choice text;
