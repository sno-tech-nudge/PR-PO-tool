-- Categories that grow out of "Other".
-- When someone picks Other they say what it is (expense_details.sub_category, an
-- item description on a purchase request, or the `other` of an itemized line). When
-- the same thing has been said often enough (default 5 times, set in system_state key
-- 'category_auto') it becomes a real category automatically, shown in every category
-- list. Past records are never rewritten.
--
-- Not counted: the legacy text imported from Zoho ("Zoho category: ..."), anything
-- already a built-in category, vague words (other, misc, general ...), and text that
-- reads like a sentence (over 40 characters or 5 words).

CREATE TABLE IF NOT EXISTS custom_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  key         text NOT NULL UNIQUE,
  source      text NOT NULL DEFAULT 'auto',   -- 'auto' (grew out of Other)
  times_seen  integer,
  active      boolean NOT NULL DEFAULT true,  -- Settings can hide one that should not be offered
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  changed_by  text,
  changed_at  timestamptz
);
ALTER TABLE custom_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_categories_all ON custom_categories;
CREATE POLICY custom_categories_all ON custom_categories FOR ALL USING (true) WITH CHECK (true);

INSERT INTO system_state (key, value, updated_by)
VALUES ('category_auto', '{"threshold": 5}'::jsonb, 'system')
ON CONFLICT (key) DO NOTHING;

-- "Stage hires", "stage hire" and "Stage-Hire!" all become the same key, and "&" or
-- "and" is ignored, so "Machinery and Plants" matches "Machinery & Plants".
CREATE OR REPLACE FUNCTION public.category_key(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(t, '')),
    '[^[:alnum:][:space:]]+', ' ', 'g'), '\yand\y', ' ', 'g'), '(\w{3,})s\y', '\1', 'g'), '\s+', ' ', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.jsonb_arr(j jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN jsonb_typeof(j) = 'array' THEN j ELSE '[]'::jsonb END $$;

-- Looks at one piece of "what Other is" text and makes it a category if it has been
-- said often enough. Never raises: a failure here must not stop a save.
CREATE OR REPLACE FUNCTION public.promote_other_category(raw text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k   text := category_key(raw);
  thr int;
  n   int;
  nm  text;
  builtin text[] := ARRAY['Travel Fare','Lodging and Boarding','Food','Bike Fare','Consultant Fee','Professional Fee',
    'Retainership / Consultancy','Legal Fees','Courier','Service','Staff Welfare','Filing Fees','Furniture and Fixtures',
    'Housekeeping','Leasehold Improvements','Medicine','Relocation Allowance','Repairs and Maintenance',
    'Subscription / Software','Learning and Development','Machinery & Plants','Prize Challenge','Hiring'];
BEGIN
  IF k IS NULL OR length(k) < 3 OR length(btrim(raw)) > 40 THEN RETURN; END IF;
  IF array_length(regexp_split_to_array(k, '\s+'), 1) > 5 THEN RETURN; END IF;
  IF k LIKE 'zoho category%' THEN RETURN; END IF;
  IF k = ANY (ARRAY['other','misc','miscellaneou','general','variou','expense','na','n a','none','nil','test','testing','unknown']) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM custom_categories WHERE key = k) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM unnest(builtin) b WHERE category_key(b) = k) THEN RETURN; END IF;

  SELECT coalesce((value->>'threshold')::int, 5) INTO thr FROM system_state WHERE key = 'category_auto';
  thr := greatest(coalesce(thr, 5), 2);

  SELECT (SELECT count(*) FROM expense_details WHERE category = 'Other' AND category_key(sub_category) = k)
       + (SELECT count(*) FROM expense_details e, jsonb_array_elements(jsonb_arr(e.itemized_lines)) l
            WHERE l->>'category' = 'Other' AND category_key(l->>'other') = k)
       + (SELECT count(*) FROM purchase_requests p, jsonb_array_elements(jsonb_arr(p.line_items)) l
            WHERE coalesce(p.status, '') <> 'draft' AND l->>'category' = 'Other' AND category_key(l->>'description') = k)
    INTO n;
  IF n < thr THEN RETURN; END IF;

  -- Named after the most common way people wrote it.
  SELECT s.t INTO nm FROM (
    SELECT btrim(sub_category) t FROM expense_details WHERE category = 'Other' AND category_key(sub_category) = k
    UNION ALL SELECT btrim(l->>'other') FROM expense_details e, jsonb_array_elements(jsonb_arr(e.itemized_lines)) l
      WHERE l->>'category' = 'Other' AND category_key(l->>'other') = k
    UNION ALL SELECT btrim(l->>'description') FROM purchase_requests p, jsonb_array_elements(jsonb_arr(p.line_items)) l
      WHERE coalesce(p.status, '') <> 'draft' AND l->>'category' = 'Other' AND category_key(l->>'description') = k
  ) s GROUP BY s.t ORDER BY count(*) DESC, length(s.t) ASC LIMIT 1;
  nm := coalesce(nm, btrim(raw));
  IF nm = upper(nm) OR nm = lower(nm) THEN nm := initcap(nm); END IF;

  INSERT INTO custom_categories (name, key, source, times_seen, created_by) VALUES (nm, k, 'auto', n, 'system')
  ON CONFLICT (key) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO activity_log (entity_type, entity_id, entity_ref, action, to_value, actor_name, note)
  VALUES ('settings', 'categories', nm, 'category_auto_created', nm, 'System',
          'Typed under Other ' || n || ' times, so it is now a category.');
  INSERT INTO expense_notifications (recipient_id, type, message, related_type)
  SELECT email, 'category',
         'New category "' || nm || '" was created automatically after it was typed under Other ' || n ||
         ' times. Add a TDS rule for it in Settings if it needs one.', 'category'
  FROM team_members WHERE role IN ('finance', 'admin');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_promote_other_expense() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l jsonb;
BEGIN
  IF NEW.category = 'Other' AND NEW.sub_category IS NOT NULL THEN PERFORM promote_other_category(NEW.sub_category); END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(jsonb_arr(NEW.itemized_lines)) LOOP
    IF l->>'category' = 'Other' AND coalesce(l->>'other', '') <> '' THEN PERFORM promote_other_category(l->>'other'); END IF;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_promote_other_pr() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l jsonb;
BEGIN
  IF coalesce(NEW.status, '') <> 'draft' THEN
    FOR l IN SELECT * FROM jsonb_array_elements(jsonb_arr(NEW.line_items)) LOOP
      IF l->>'category' = 'Other' AND coalesce(l->>'description', '') <> '' THEN PERFORM promote_other_category(l->>'description'); END IF;
    END LOOP;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS promote_other_expense ON expense_details;
CREATE TRIGGER promote_other_expense AFTER INSERT OR UPDATE OF category, sub_category, itemized_lines ON expense_details
  FOR EACH ROW EXECUTE FUNCTION trg_promote_other_expense();

DROP TRIGGER IF EXISTS promote_other_pr ON purchase_requests;
CREATE TRIGGER promote_other_pr AFTER INSERT OR UPDATE OF line_items, status ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION trg_promote_other_pr();
