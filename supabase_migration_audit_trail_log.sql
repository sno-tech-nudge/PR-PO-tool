-- Logs every time an admin views or downloads the Vendor -> PR -> PO -> ER
-- audit trail, for accountability (who pulled which record's trail, and
-- when) — the trail itself is read-only and derived from existing linked
-- records (purchase_requests.vendor_id, purchase_orders.pr_id,
-- expense_reports.po_id), which already persist the chain; this table is
-- purely an access log, not a copy of the chain.
CREATE TABLE IF NOT EXISTS audit_trail_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_by text NOT NULL,
  po_id uuid NOT NULL,
  action text NOT NULL, -- 'viewed' | 'downloaded'
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_trail_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_trail_access_log_all ON audit_trail_access_log FOR ALL USING (true) WITH CHECK (true);
