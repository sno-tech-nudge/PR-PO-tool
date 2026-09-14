-- Migrated Zoho expense rows carry a compiled "Expense Report PDF" link
-- (Google Drive, report-level but present on every expense row in the
-- source export) alongside the existing po_pdf_link/vr_pdf_link fields.
-- Stored as a plain external URL, opened directly rather than proxied
-- through our own Storage — same "View Attachment" pattern as those two.
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS er_pdf_link text;
