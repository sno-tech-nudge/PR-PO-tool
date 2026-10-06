import { supabase } from './supabase'
import { toPaymentMode } from './paymentModes'

// Shared by ExpenseDetails.jsx's full-form save and the capture flow's
// "Save expense, finish details later" quick-save — one insert envelope so
// both paths write the exact same shape of row.
export async function insertExpenseDetails({ payload, captureId, userEmail }) {
  return supabase.from('expense_details').insert({
    ...payload,
    capture_id: captureId ?? null,
    submitted_at: new Date().toISOString(),
    user_email: userEmail ?? null,
    status: 'saved',
  })
}

// Maps ConfirmationScreen's already-known fields onto expense_details
// columns, and explicitly nulls out everything that can only be answered in
// the full ExpenseDetails form (entity, description, who this was for, PO
// linkage, etc.) — a null `entity` is what later marks this row as "needs
// details" wherever saved expenses are listed.
export function buildQuickSaveExpensePayload(data) {
  return {
    amount: data?.amount ?? null,
    vendor: data?.vendor ?? null,
    date: data?.date ?? null,
    category: data?.category ?? null,
    invoice_number: data?.invoice_number ?? null,
    gstin: data?.gstin ?? null,
    payment_method: toPaymentMode(data?.payment_method),
    report_id: null,
    entity: null,
    program: null,
    donor_name: null,
    expense_nature: null,
    sub_category: null,
    po_number: null,
    po_pdf_link: null,
    paid_to: null,
    vr_pdf_link: null,
    reference_number: null,
    card_no: data?.card_no ?? null,
    expense_type: null,
    attendee_count: null,
    per_person_amount: null,
    attendee_names: null,
    attendees: null,
    description: null,
    reimbursable: true,
    itemized_lines: null,
  }
}

// Mirrors the required-field rules in ExpenseDetails' getErrors() for an
// existing expense — an expense that fails this still needs its details
// filled in (quick-saved receipts always do) before it can go into a report.
export function isExpenseComplete(e) {
  if (!e) return false
  return !!(e.amount && e.vendor && e.date && e.category && e.payment_method && e.entity && e.description
    && (e.payment_method !== 'Company Card' || e.card_no))
}
