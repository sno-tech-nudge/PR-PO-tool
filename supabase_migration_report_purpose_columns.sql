-- ReportDetails.jsx's "What were these expenses for" question (purpose_type
-- + its description) is required on every report but was never persisted
-- anywhere — only passed transiently into the preview screen and then lost
-- on submit. Approvers need to see it (and anyone revisiting the report
-- later), so it needs a real home on the row.
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS purpose_type text;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS purpose_description text;
