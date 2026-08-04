-- ============================================================
-- Nudge Expense Tracker — Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================


-- ── 1. Add missing columns to vendors table ─────────────────
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_id               text,
  ADD COLUMN IF NOT EXISTS org_name                text,
  ADD COLUMN IF NOT EXISTS org_type                text,
  ADD COLUMN IF NOT EXISTS contact_person          text,
  ADD COLUMN IF NOT EXISTS phone                   text,
  ADD COLUMN IF NOT EXISTS email                   text,
  ADD COLUMN IF NOT EXISTS website                 text,
  ADD COLUMN IF NOT EXISTS address_line1           text,
  ADD COLUMN IF NOT EXISTS address_line2           text,
  ADD COLUMN IF NOT EXISTS pincode                 text,
  ADD COLUMN IF NOT EXISTS city                    text,
  ADD COLUMN IF NOT EXISTS state                   text,
  ADD COLUMN IF NOT EXISTS country                 text DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS date_of_incorporation   date,
  ADD COLUMN IF NOT EXISTS pan_number              text,
  ADD COLUMN IF NOT EXISTS org_registration_number text,
  ADD COLUMN IF NOT EXISTS org_registration_state  text,
  ADD COLUMN IF NOT EXISTS is_msme                 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_gstin_registered     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gstin                   text,
  ADD COLUMN IF NOT EXISTS beneficiary_name        text,
  ADD COLUMN IF NOT EXISTS account_number          text,
  ADD COLUMN IF NOT EXISTS ifsc_code               text,
  ADD COLUMN IF NOT EXISTS bank_name               text,
  ADD COLUMN IF NOT EXISTS branch                  text,
  ADD COLUMN IF NOT EXISTS cancelled_cheque_path   text,
  ADD COLUMN IF NOT EXISTS pan_copy_path           text,
  ADD COLUMN IF NOT EXISTS submitted_by            text,
  ADD COLUMN IF NOT EXISTS approved_by             text,
  ADD COLUMN IF NOT EXISTS status                  text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason        text,
  ADD COLUMN IF NOT EXISTS submitted_at            timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_at             timestamptz;


-- ── 2. Create pr-quotes storage bucket ──────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pr-quotes', 'pr-quotes', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pr_quotes_insert'
  ) THEN
    EXECUTE $p$ CREATE POLICY pr_quotes_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pr-quotes') $p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pr_quotes_select'
  ) THEN
    EXECUTE $p$ CREATE POLICY pr_quotes_select ON storage.objects FOR SELECT USING (bucket_id = 'pr-quotes') $p$;
  END IF;
END $$;


-- ── 3. Import 6 approved vendors from Zoho ──────────────────

INSERT INTO vendors (vendor_id, org_name, org_type, contact_person, phone, email, website, address_line1, pincode, city, state, country, date_of_incorporation, pan_number, org_registration_number, org_registration_state, is_msme, is_gstin_registered, gstin, beneficiary_name, account_number, ifsc_code, bank_name, branch, submitted_by, approved_by, status, submitted_at, approved_at)
VALUES ('26/27-VR-07-0045', 'Pune International Centre', 'Trust/NGO', 'Geeta Hosmane', '9881098445', 'geeta@puneinternationalcentre.org', 'https://puneinternationalcentre.org/contact-us/', 'S.no. 34/A, Behind C-DAC, Mansarovar, Panchawati, Pashan', '411008', 'Pune', 'Maharashtra', 'India', '2012-07-01', 'AACTP1416D', 'F-31883 (P)', 'Maharashtra', false, true, '27AACTP1416D1ZY', 'Pune International Centre', '37627976432', 'SBIN0004120', 'State Bank of India', 'PBB Senapati Bapat Road, Pune', 'zoho_import', 'zoho_import', 'approved', now(), now())
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO vendors (vendor_id, org_name, org_type, contact_person, phone, email, website, address_line1, pincode, city, state, country, date_of_incorporation, pan_number, org_registration_number, org_registration_state, is_msme, is_gstin_registered, gstin, beneficiary_name, account_number, ifsc_code, bank_name, branch, submitted_by, approved_by, status, submitted_at, approved_at)
VALUES ('26/27-VR-07-0044', 'BIBEKANANDA PRUSTI', 'Individual/Freelancer', 'Bibekananda Prusti', '9938625958', 'bibekprusti1986@gmail.com', null, 'AT-PALASA, PO-CHHAYALSINGH PS-BONTH', '756114', 'Bhadrak', 'Odisha', 'India', '2026-07-10', 'DGRPP7728E', 'DGRPP7728E', 'Odisha', false, false, null, 'BIBEKANANDA PRUSTI', '32609749973', 'SBIN0000036', 'State Bank of India', 'Bhadrak, Bhadrak, Odisha', 'zoho_import', 'zoho_import', 'approved', now(), now())
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO vendors (vendor_id, org_name, org_type, contact_person, phone, email, website, address_line1, pincode, city, state, country, date_of_incorporation, pan_number, org_registration_number, org_registration_state, is_msme, is_gstin_registered, gstin, beneficiary_name, account_number, ifsc_code, bank_name, branch, submitted_by, approved_by, status, submitted_at, approved_at)
VALUES ('26/27-VR-07-0043', 'FLEUR HOTELS PRIVATE LIMITED', 'Private Limited', 'Arup Golui', '6289858174', 'bqtsales.pkk1@lemontreehotels.com', null, 'Plot No. BG-9, Block 1B, Mauza Thakdari, New Town', '700156', 'New Town', 'West Bengal', 'India', '2003-07-09', 'AACCC4602P', '19AACCC4602P1ZG', 'West Bengal', false, true, '19AACCC4602P1ZG', 'LEMON TREE PREMIER KOLKATA A UNIT OF FLEUR HOTELS PVT LTD', '102581300000195', 'YESB0001025', 'Yes Bank', 'Udyog Vihar, Gurgaon, Haryana', 'zoho_import', 'zoho_import', 'approved', now(), now())
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO vendors (vendor_id, org_name, org_type, contact_person, phone, email, website, address_line1, pincode, city, state, country, date_of_incorporation, pan_number, org_registration_number, org_registration_state, is_msme, is_gstin_registered, gstin, beneficiary_name, account_number, ifsc_code, bank_name, branch, submitted_by, approved_by, status, submitted_at, approved_at)
VALUES ('26/27-VR-07-0042', 'PAULMECH HOSPITALITY PRIVATE LIMITED', 'Private Limited', 'Anirban Das', '9147709002', 'anirban.das@ihg.com', null, 'Plot No CF-15, Newtown, Rajarhat', '700156', 'Kolkata', 'West Bengal', 'India', '2010-07-27', 'AAFCP6039C', 'U55101WB2010PTC151700', 'West Bengal', false, true, '19AAFCP6039C1ZG', 'HOLIDAY INN EXPRESS NEW TOWN KOLKATA', '13550200060688', 'FDRL0001355', 'Federal Bank', 'Gurgaon, Haryana', 'zoho_import', 'zoho_import', 'approved', now(), now())
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO vendors (vendor_id, org_name, org_type, contact_person, phone, email, website, address_line1, pincode, city, state, country, date_of_incorporation, pan_number, org_registration_number, org_registration_state, is_msme, is_gstin_registered, gstin, beneficiary_name, account_number, ifsc_code, bank_name, branch, submitted_by, approved_by, status, submitted_at, approved_at)
VALUES ('26/27-VR-07-0041', 'Samarjit Mohanty', 'Individual/Freelancer', 'Samarjit Mohanty', '9437059921', 'prabirmohanty9@gmail.com', null, 'Bhaluki Patala, Kendujhar Town, Madhapur', '758001', 'Kendujhar', 'Odisha', 'India', '1988-06-01', 'CLMPM5782J', '614520802295', null, false, false, null, 'Samarjit Mohanty', '20173864533', 'SBIN0012072', 'State Bank of India', 'Keonjhar Evening, Keonjhar, Odisha', 'zoho_import', 'zoho_import', 'approved', now(), now())
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO vendors (vendor_id, org_name, org_type, contact_person, phone, email, website, address_line1, pincode, city, state, country, date_of_incorporation, pan_number, org_registration_number, org_registration_state, is_msme, is_gstin_registered, gstin, beneficiary_name, account_number, ifsc_code, bank_name, branch, submitted_by, approved_by, status, submitted_at, approved_at)
VALUES ('26/27-VR-07-0040', 'Shivani Karampuri', 'Individual/Freelancer', 'Shivani Karampuri', '9872220191', 'karampuri.shivani@gmail.com', null, 'Plot 75, Bajrang Nagar, Near Mamta Cinema, Parvat Gam', '395010', 'Surat', 'Gujarat', 'India', '1999-01-06', 'HFQPK1521G', 'HFQPK1521G', null, false, false, null, 'Shivani Karampuri', '38164049006', 'SBIN0011020', 'State Bank of India', 'Puna Kumbharia, Surat, Gujarat', 'zoho_import', 'zoho_import', 'approved', now(), now())
ON CONFLICT (vendor_id) DO NOTHING;


-- ── Verify ───────────────────────────────────────────────────
SELECT vendor_id, org_name, org_type, status, city, state FROM vendors ORDER BY submitted_at DESC;
