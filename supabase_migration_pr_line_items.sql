-- Adds support for multiple line items (quantity x rate per unit pairs) on a
-- single Purchase Request. purchase_requests.quantity/rate_per_unit remain in
-- place for backward compatibility with PRs created before this change (and
-- are still populated for the common single-line-item case); line_items is
-- the source of truth going forward whenever more than one item is entered.
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS line_items jsonb;
