-- Procurement Policy v3.0 compliance migration
-- Run this in: Supabase Dashboard → SQL Editor

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS donor_name                  text,
  ADD COLUMN IF NOT EXISTS expense_type                text,
  ADD COLUMN IF NOT EXISTS gst_amount                  numeric,
  ADD COLUMN IF NOT EXISTS quote_paths                 jsonb,
  ADD COLUMN IF NOT EXISTS single_source_justification text;
