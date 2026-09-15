-- Migrated expense rows get status='reported' (an internal workflow state
-- meaning "already bundled into a submitted report") the same as any
-- organically-created expense once it's in a report — accurate, but reads
-- as confusing/wrong next to the real historical status Zoho actually had
-- ("approved"). source_status preserves that original value for display
-- only; the real `status` column keeps its existing workflow meaning
-- untouched (still correctly excludes these from being pulled into a new
-- report).
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS source_status text;
