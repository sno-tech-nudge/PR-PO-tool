-- Name↔email lookup, sourced from the Zoho user export, so the app can
-- display a real person's name instead of their raw email address almost
-- everywhere. One-time snapshot for now (the source sheet auto-updates
-- every 3 hours — live sync is a later integration, not built here).
-- User ID and Status from the export are deliberately not persisted.
CREATE TABLE IF NOT EXISTS zoho_directory (
  email text PRIMARY KEY,
  name text NOT NULL,
  role text
);

ALTER TABLE zoho_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY zoho_directory_all ON zoho_directory
  FOR ALL USING (true) WITH CHECK (true);
