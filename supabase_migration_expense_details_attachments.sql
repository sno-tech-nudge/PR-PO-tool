-- Supports attaching more than one supporting document (receipt, quotation,
-- etc.) to a single PO-tranche expense line. The first/primary document
-- stays on expense_captures.receipt_storage_path (existing convention,
-- already read by AdminReportDetail.jsx's ReceiptLink); anything additional
-- goes here as [{ path, label }].
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS supporting_attachments jsonb;
