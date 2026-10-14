import { supabase } from './supabase'
import { logActivity } from './activityLog'
import { createNotification } from './approvalEngine'
import { recomputeAdvanceApplied } from './advanceBalance'

// Deductions the Accounts team makes from a line after submission, and the
// net payable that follows from them (and from TDS on vendor payments).

export const DEDUCTION_REASONS = [
  'Over the policy limit',
  'Not enough proof',
  'Personal or not business',
  'Duplicate of another claim',
  'Other',
]

const num = v => Number(v) || 0

// What a report actually pays out: the net after deductions and TDS once Accounts
// has worked on it, otherwise the claimed total.
export const netAmount = r => (r?.net_payable != null ? Number(r.net_payable) : num(r?.total_amount))
const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`

// What is actually paid for one line.
export function lineNet(expense, kind) {
  return Math.max(0, num(expense.amount) - num(expense.deduction_amount) - (kind === 'vendor' ? num(expense.tds_amount) : 0))
}

// The excess over a per-person limit the policy engine already found, so the
// Accounts team can take it as the deduction in one click.
export function suggestDeduction(expense, policy) {
  const hit = (policy?.violations || []).find(v => v.rule === 'food_limit' || v.rule === 'hotel_limit')
  if (!hit) return null
  const people = expense.expense_type === 'my_team' && Number(expense.attendee_count) > 1 ? Number(expense.attendee_count) : 1
  const amount = num(expense.amount)
  if (hit.rule === 'food_limit') {
    const excess = Math.round(amount - 750 * people)
    return excess > 0 ? { amount: excess, reason: 'Over the policy limit', note: `Food limit is ₹750 per person per day${people > 1 ? `, for ${people} people` : ''}.` } : null
  }
  const text = `${expense.description || ''} ${expense.trip_name || ''}`.toLowerCase()
  const metro = ['ahmedabad', 'bangalore', 'bengaluru', 'chennai', 'delhi', 'new delhi', 'hyderabad', 'mumbai'].some(c => text.includes(c))
  const limit = (metro ? 4000 : 3250) * 1.18 * people
  const excess = Math.round(amount - limit)
  return excess > 0 ? { amount: excess, reason: 'Over the policy limit', note: `Hotel limit is ₹${metro ? 4000 : 3250} plus GST per person per night.` } : null
}

// Re-adds a report's lines after a deduction or TDS change and stores the
// result on the report, which is the figure reimbursements are paid from.
export async function recomputeNetPayable(reportId) {
  const { data: rep } = await supabase.from('expense_reports').select('payment_kind, total_amount').eq('id', reportId).maybeSingle()
  const { data: links } = await supabase.from('report_expenses').select('expense_details(amount, deduction_amount, tds_amount, payment_method)').eq('report_id', reportId)
  const lines = (links || []).map(l => l.expense_details).filter(Boolean)
  const net = lines.reduce((s, e) => s + lineNet(e, rep?.payment_kind), 0)
  await supabase.from('expense_reports').update({ net_payable: net }).eq('id', reportId)
  // Whatever part of the report is settled from advances follows the new net.
  await recomputeAdvanceApplied(reportId, {
    reimbursableNet: lines.filter(e => e.payment_method !== 'Company Card').reduce((s, e) => s + lineNet(e, rep?.payment_kind), 0),
    settleLinesNet: lines.filter(e => e.payment_method === 'Advance Adjustment').reduce((s, e) => s + lineNet(e, rep?.payment_kind), 0),
  }).catch(() => {})
  return net
}

// Saves (or clears, with amount 0) a deduction on one line.
export async function saveDeduction({ report, expense, amount, reason, note, user }) {
  const value = Math.min(num(amount), num(expense.amount))
  const clearing = !(value > 0)
  const patch = clearing
    ? { deduction_amount: null, deduction_reason: null, deduction_note: null, deducted_by: null, deducted_at: null }
    : { deduction_amount: value, deduction_reason: reason || 'Other', deduction_note: note?.trim() || null, deducted_by: user?.email || null, deducted_at: new Date().toISOString() }
  const { error } = await supabase.from('expense_details').update(patch).eq('id', expense.id)
  if (error) throw error
  const net = await recomputeNetPayable(report.id)

  const line = `${expense.vendor || 'Expense'} ${money(expense.amount)}`
  logActivity({
    entityType: 'report', entityId: report.id, entityRef: report.report_reference,
    action: clearing ? 'vouch_deduction_removed' : 'vouch_deduct',
    toValue: clearing ? line : `${line}: ${money(value)} deducted`, actor: user,
    note: clearing ? null : [reason, note].filter(Boolean).join(': '),
  })
  if (!clearing && report.employee_email) {
    createNotification(report.employee_email, report.id, 'deduction',
      `${money(value)} was deducted from ${line} in ${report.report_reference}. Reason: ${reason || 'Other'}.`,
      supabase, { relatedType: 'report', relatedId: report.id })
  }
  return { patch, net }
}

// Saves the TDS decision for one vendor line: the base/GST split, the section
// and rate that applied, the amount deducted and why.
export async function saveTds({ report, expense, base, gst, result, amountOverride, user }) {
  const computed = Number(result?.amount) || 0
  const overridden = amountOverride !== '' && amountOverride != null && Number(amountOverride) !== computed
  const amount = overridden ? Math.max(0, Number(amountOverride) || 0) : computed
  const total = num(expense.amount)
  const patch = {
    base_amount: num(base) || null,
    gst_amount: num(gst) || null,
    other_amount: Math.max(0, Math.round((total - num(base) - num(gst)) * 100) / 100) || null,
    tds_status: result?.status === 'review' ? 'review' : amount > 0 ? 'applicable' : 'not_applicable',
    tds_section: result?.section || null,
    tds_rate: result?.rate ?? null,
    tds_amount: amount,
    tds_note: overridden ? `Adjusted by Accounts from ${money(computed)}. ${result?.note || ''}`.trim() : (result?.note || null),
    tds_set_by: user?.email || null,
    tds_set_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('expense_details').update(patch).eq('id', expense.id)
  if (error) throw error
  const net = await recomputeNetPayable(report.id)
  logActivity({
    entityType: 'report', entityId: report.id, entityRef: report.report_reference, action: 'tds_set',
    toValue: `${expense.vendor || 'Expense'} ${money(expense.amount)}: ${amount > 0 ? `${money(amount)} TDS` : 'no TDS'}`,
    actor: user, note: patch.tds_note,
  })
  return { patch, net }
}
