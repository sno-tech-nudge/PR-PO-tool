-- The attendee multi-select in ExpenseDetails.jsx needs to (a) only offer
-- people who are still active in Zoho (excluding Inactive/Deleted accounts)
-- and (b) capture each selected attendee's email alongside their name, not
-- just a flat name string, for future features that need to look someone up
-- by email rather than fuzzy-matching a typed name.
ALTER TABLE zoho_directory ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS attendees jsonb;
