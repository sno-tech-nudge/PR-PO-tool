-- Records the explicit Yes/No answer to "is this report related to a
-- Purchase Order?" (now asked on every report, per finance's ask that
-- PR/PO stay independent of the Expense Report module — the report
-- decides whether to link itself to a PO, not the other way round).
-- Distinct from po_id being null, which could otherwise mean either
-- "answered No" or "never asked" (reports submitted before this existed).
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS po_related boolean;
