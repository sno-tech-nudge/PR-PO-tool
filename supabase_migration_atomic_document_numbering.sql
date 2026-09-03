-- Fixes a real race condition ahead of multi-user launch: generatePRNumber /
-- generatePONumber / generateVendorId (PRForm.jsx, prApprovalActions.js,
-- VendorForm.jsx) all read `count(*) matching this fiscal year's prefix`
-- client-side, then insert `count+1` as the new number. Two people
-- submitting around the same moment can both read the same count and both
-- insert the SAME pr_number/po_number/vendor_id — silently, since nothing
-- in the schema enforces uniqueness today.
--
-- next_doc_number(kind, fy_prefix) makes generation atomic: it lazily
-- creates a real Postgres SEQUENCE the first time a given (kind, fiscal
-- year) pair is used, seeded to continue from whatever the count already
-- is at that moment (so it picks up exactly where the old scheme left off,
-- no renumbering of history) — from then on every call is a plain
-- nextval(), which Postgres guarantees is race-free under concurrent
-- callers by construction, no locking required.
--
-- SECURITY DEFINER because creating a sequence is DDL, which the anon role
-- this app's client runs as cannot do directly (same anon-key-trusted model
-- as every other table here — see the RLS policies already in place).
CREATE OR REPLACE FUNCTION next_doc_number(kind text, fy_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_name text;
  existing_count int;
  next_val int;
  like_pattern text;
BEGIN
  IF kind NOT IN ('PR', 'PO', 'VR') THEN
    RAISE EXCEPTION 'next_doc_number: invalid kind %', kind;
  END IF;
  IF fy_prefix !~ '^[A-Za-z0-9/]{1,20}$' THEN
    RAISE EXCEPTION 'next_doc_number: invalid fy_prefix %', fy_prefix;
  END IF;

  -- Fully lowercased: %I below (CREATE SEQUENCE) case-preserves whatever we
  -- pass it, but to_regclass()/nextval(%L) fold an unquoted-looking string
  -- to lowercase when resolving it — mixed case here would make the two
  -- sides disagree on the sequence's real name and "relation does not
  -- exist" on the very next call (confirmed by testing; harmless for the
  -- current all-digit fy_prefix values like "26/27", but not for kind/
  -- fy_prefix values with letters in general, so normalize unconditionally
  -- rather than relying on today's inputs happening to avoid it).
  seq_name := 'doc_seq_' || lower(kind) || '_' || lower(regexp_replace(fy_prefix, '[^A-Za-z0-9]', '_', 'g'));

  -- CREATE SEQUENCE IF NOT EXISTS is NOT race-free on its own: two sessions
  -- can both see "doesn't exist yet" from their own snapshot and both race
  -- to create it, and the loser gets a hard duplicate-key error instead of
  -- silently no-op'ing (confirmed by testing under real concurrent
  -- connections). The advisory lock below serializes only this
  -- once-per-(kind,fiscal-year) check-and-create — once the sequence
  -- exists, every future call skips straight to nextval(), which Postgres
  -- guarantees is race-free with no locking needed.
  PERFORM pg_advisory_xact_lock(hashtext(seq_name));
  IF to_regclass('public.' || seq_name) IS NULL THEN
    like_pattern := fy_prefix || '-' || kind || '-%';
    IF kind = 'PR' THEN
      SELECT count(*) INTO existing_count FROM purchase_requests WHERE pr_number LIKE like_pattern;
    ELSIF kind = 'PO' THEN
      SELECT count(*) INTO existing_count FROM purchase_orders WHERE po_number LIKE like_pattern;
    ELSE
      SELECT count(*) INTO existing_count FROM vendors WHERE vendor_id LIKE like_pattern;
    END IF;
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START %s', seq_name, existing_count + 1);
  END IF;

  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN fy_prefix || '-' || kind || '-07-' || lpad(next_val::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_doc_number(text, text) TO anon, authenticated;

-- Defense in depth: even with the atomic generator above, make a collision
-- fail loudly instead of silently duplicating (e.g. if any other code path
-- ever inserts a hand-picked number). Confirmed zero existing duplicates
-- before adding these. NULLs (draft rows with no number assigned yet, if
-- any) are unaffected — Postgres UNIQUE never treats two NULLs as equal.
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_pr_number_unique UNIQUE (pr_number);
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_po_number_unique UNIQUE (po_number);
ALTER TABLE vendors ADD CONSTRAINT vendors_vendor_id_unique UNIQUE (vendor_id);
