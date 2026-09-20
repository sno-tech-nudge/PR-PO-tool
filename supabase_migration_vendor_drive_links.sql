-- Vendor master import ("TNI Approved Vendors - Master") carries a Google
-- Drive link for each document alongside the Zoho one (Zoho Creator app
-- links require login, same issue as PO Pdf link/VR PDF Link on expenses —
-- see src/components/shared/ExpenseAttachments.jsx's isZohoCreatorLink).
-- These are plain external URLs, not Supabase Storage paths, so they can't
-- reuse cancelled_cheque_path etc. (VendorDetail.jsx calls createSignedUrl
-- on those, which only works for a real storage path).
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS cancelled_cheque_drive_link text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan_copy_drive_link text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS registration_certificate_drive_link text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_certificate_drive_link text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS msme_certificate_drive_link text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS drive_folder_link text;
