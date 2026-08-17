-- ============================================================
-- Nudge Expense Tracker — Zoho-parity fields on expense_details
-- Run in: Supabase Dashboard → SQL Editor
--
-- Adds the Entity/Donor/Programme classification (already modeled and
-- validated on the PR side via src/lib/donorData.js) plus a couple of
-- reference fields to expense_details, so a single expense claim can be
-- tagged the same way a purchase request already is.
--
-- Purely additive (ADD COLUMN IF NOT EXISTS) — safe to re-run, does not
-- touch any existing row or column. Confirmed via REST probing that none
-- of these columns exist yet.
-- ============================================================

ALTER TABLE expense_details
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS program text,
  ADD COLUMN IF NOT EXISTS subprogram text,
  ADD COLUMN IF NOT EXISTS donor_name text,
  ADD COLUMN IF NOT EXISTS expense_nature text,
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS card_no text,
  ADD COLUMN IF NOT EXISTS reimbursable boolean DEFAULT true;

-- Remaining fields from the full Zoho-style per-expense field list (PO
-- Number, Sub Category, PO/VR PDF links, Paid To, Sub Granting Category,
-- and an optional itemized-lines breakdown of Amount). Purely additive.
ALTER TABLE expense_details
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS po_pdf_link text,
  ADD COLUMN IF NOT EXISTS paid_to text,
  ADD COLUMN IF NOT EXISTS vr_pdf_link text,
  ADD COLUMN IF NOT EXISTS sub_granting_category text,
  ADD COLUMN IF NOT EXISTS itemized_lines jsonb;
