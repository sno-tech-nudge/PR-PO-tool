-- Advances module — employee travel advances, approved (single level, since
-- the cap is well under the existing report-approval fallback's >50k tier),
-- then recorded by Finance once cash is actually disbursed, then optionally
-- linked to a later expense report (mutually exclusive with a PO link).
-- Same wide-open-RLS style as every other table in this app (application
-- code is the access-control layer, not row-level policies) — see
-- supabase_migration_pr_po_module_complete.sql for the identical pattern.

CREATE TABLE advances (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  requested_by          text NOT NULL,
  amount                numeric NOT NULL CHECK (amount > 0 AND amount <= 20000),
  description           text NOT NULL,
  expected_usage_date   date NOT NULL,
  entity                text NOT NULL,
  program               text NOT NULL,
  stream                text,
  advance_type          text NOT NULL DEFAULT 'Travel',
  is_multi_individual   boolean NOT NULL DEFAULT false,
  num_people            integer,
  status                text NOT NULL DEFAULT 'pending_approval',
  rejection_reason      text,
  approved_by           text,
  approved_at           timestamptz,
  rejected_by           text,
  rejected_at           timestamptz,
  recorded_by           text,
  recorded_at           timestamptz
);

ALTER TABLE advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY advances_all ON advances FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE expense_reports
  ADD COLUMN advance_related boolean,
  ADD COLUMN advance_id uuid REFERENCES advances(id);

ALTER TABLE expense_reports
  ADD CONSTRAINT po_advance_mutually_exclusive
  CHECK (NOT (po_related IS TRUE AND advance_related IS TRUE));
