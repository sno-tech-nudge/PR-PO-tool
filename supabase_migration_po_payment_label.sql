-- Lets SubmitPOExpense.jsx capture which numbered payment/tranche a given
-- invoice represents against a PO's agreed schedule (e.g. "2nd of 4
-- (Quarterly)") — free text, since there's no formal installment-plan table,
-- just a description of where this payment sits in the vendor's payment
-- schedule. Nullable/additive, existing rows unaffected.
ALTER TABLE expense_details ADD COLUMN IF NOT EXISTS po_payment_label text;
