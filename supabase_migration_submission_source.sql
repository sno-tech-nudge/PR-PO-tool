-- Tracks whether a purchase_requests / vendors row was submitted directly in
-- this tool vs. relayed from Nucleus (api/intake/pr.js / api/intake/vendor.js)
-- so PRStatusModal.jsx / VendorStatusModal.jsx can show "Submitted through
-- Nucleus" on the "Submitted" step. Both intake endpoints already build
-- their payload row-for-row identically to this tool's own in-app forms —
-- this is the one deliberate difference, and it's additive/backward
-- compatible: any existing row defaults to 'app' (submitted directly here),
-- which is the correct historical value for every row that predates this
-- column.
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
