-- ============================================================
-- Nudge Expense Tracker — Company Card expenses are never reimbursable
-- Run in: Supabase Dashboard → SQL Editor
--
-- Company-card spend is already paid by the company, so reimbursing it pays
-- the same expense twice. The form hides the "Claim reimbursement" box for
-- Company Card; this trigger is the backstop for every other entry route
-- (bulk add, quick-save, API, older clients).
--
-- Fires on INSERT, and on UPDATE only when payment_method or reimbursable
-- is being changed, so already-finalised rows are never rewritten by
-- unrelated updates. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_company_card_not_reimbursable()
RETURNS trigger AS $$
BEGIN
  IF NEW.payment_method = 'Company Card' THEN
    IF TG_OP = 'INSERT'
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.reimbursable IS DISTINCT FROM OLD.reimbursable THEN
      NEW.reimbursable := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_card_not_reimbursable ON expense_details;
CREATE TRIGGER trg_company_card_not_reimbursable
  BEFORE INSERT OR UPDATE ON expense_details
  FOR EACH ROW EXECUTE FUNCTION enforce_company_card_not_reimbursable();
