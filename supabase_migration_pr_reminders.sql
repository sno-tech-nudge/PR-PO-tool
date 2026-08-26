-- Supports the 24h reminder cron (api/reminders.js): rejected_at gives a
-- real reference point for "how long has this sat rejected", and
-- last_reminder_at prevents the same PR from being reminded on every cron
-- run once it's already overdue.
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;
