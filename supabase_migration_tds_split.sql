-- TDS on an invoice whose line items fall under different categories.
-- tds_breakdown holds one entry per line item as Accounts confirmed it:
--   [{ "category": "...", "amount": 5000, "section": "194I", "rate": 10, "tds": 500, "status": "applicable", "note": "..." }]
-- The existing base_amount / gst_amount / other_amount (incidentals) and
-- tds_amount (the total) keep their meaning. Additive and nullable: lines saved
-- before this keep working exactly as they did.
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS tds_breakdown jsonb;
