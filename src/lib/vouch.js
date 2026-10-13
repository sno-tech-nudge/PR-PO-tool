import { supabase } from './supabase'
import { logActivity } from './activityLog'
import { createNotification } from './approvalEngine'
import { toInputDate } from './dateFormat'

// Line-by-line vouching. Each tick, flag, query and reply on an expense is one
// row in expense_vouch_events; the state of a line is just its latest event:
//   clear    Finance ticked it
//   flag     Finance noted a concern but it does not hold the report up
//   query    Finance asked the employee something; the report waits on it
//   reply    the employee answered; Finance can now tick or ask again
//   reopen   Finance took back a tick

export const LINE_STATUS = {
  none:    { label: 'Not vouched', tone: 'taupe' },
  clear:   { label: 'Vouched', tone: 'moss' },
  flag:    { label: 'Flagged', tone: 'gold' },
  query:   { label: 'Waiting on employee', tone: 'clay' },
  replied: { label: 'Employee replied', tone: 'gold' },
}

export function lineStatus(events) {
  const last = events[events.length - 1]
  if (!last || last.kind === 'reopen') return 'none'
  return last.kind === 'reply' ? 'replied' : last.kind
}

// { [expenseId]: [event, ...] } oldest first.
export async function loadVouchEvents(reportId) {
  const { data } = await supabase
    .from('expense_vouch_events')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })
  const byExpense = {}
  for (const e of data || []) (byExpense[e.expense_id] ||= []).push(e)
  return byExpense
}

const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`

// Saves one event, writes it to the Activity Log, and tells the other side
// when a query or reply needs their attention.
export async function addVouchEvent({ report, expense, kind, body, user, role, notifyEmail }) {
  const row = {
    report_id: report.id,
    expense_id: expense.id,
    kind,
    body: body?.trim() || null,
    author_email: user?.email || null,
    author_name: user?.name || null,
    author_role: role,
  }
  const { data, error } = await supabase.from('expense_vouch_events').insert(row).select('*').single()
  if (error) throw error

  const line = `${expense.vendor || 'Expense'} ${money(expense.amount)}`
  logActivity({
    entityType: 'report',
    entityId: report.id,
    entityRef: report.report_reference,
    action: `vouch_${kind}`,
    toValue: line,
    actor: user,
    note: row.body,
  })

  if (kind === 'query' && report.employee_email) {
    createNotification(report.employee_email, report.id, 'query',
      `Finance has a question about ${line} in ${report.report_reference}.`,
      supabase, { relatedType: 'report', relatedId: report.id })
  }
  if (kind === 'reply' && notifyEmail) {
    createNotification(notifyEmail, report.id, 'reply',
      `${user?.name || 'The employee'} replied about ${line} in ${report.report_reference}.`,
      supabase, { relatedType: 'report', relatedId: report.id })
  }
  return data
}

// Ticks every given line in one go.
export async function clearLines({ report, expenses, user }) {
  const rows = expenses.map(expense => ({
    report_id: report.id, expense_id: expense.id, kind: 'clear', body: null,
    author_email: user?.email || null, author_name: user?.name || null, author_role: 'finance',
  }))
  if (!rows.length) return []
  const { data, error } = await supabase.from('expense_vouch_events').insert(rows).select('*')
  if (error) throw error
  logActivity({
    entityType: 'report', entityId: report.id, entityRef: report.report_reference,
    action: 'vouch_clear', toValue: `${rows.length} line${rows.length === 1 ? '' : 's'}`, actor: user,
    note: expenses.map(e => `${e.vendor || 'Expense'} ${money(e.amount)}`).join('; '),
  })
  return data
}

// What the reader found on the receipt itself, set against what was entered.
// Only differences that matter: amount off by more than ₹1, a different date,
// or a vendor name with nothing in common.
export function receiptMismatches(expense, capture) {
  const out = []
  if (!capture) return out
  const readAmount = Number(capture.receipt_extracted_amount)
  if (readAmount > 0 && expense.amount != null && Math.abs(readAmount - Number(expense.amount)) > 1) {
    out.push({ field: 'amount', entered: money(expense.amount), read: money(readAmount) })
  }
  const readDate = toInputDate(String(capture.receipt_extracted_date || '').trim())
  const enteredDate = toInputDate(String(expense.date || '').trim())
  if (readDate && enteredDate && readDate !== enteredDate) {
    out.push({ field: 'date', entered: expense.date, read: capture.receipt_extracted_date })
  }
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const a = key(expense.vendor)
  const b = key(capture.receipt_extracted_vendor)
  if (a && b && !a.includes(b) && !b.includes(a)) {
    const wordsA = new Set(String(expense.vendor).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
    const shared = String(capture.receipt_extracted_vendor).toLowerCase().split(/[^a-z0-9]+/).some(w => wordsA.has(w))
    if (!shared) out.push({ field: 'vendor', entered: expense.vendor, read: capture.receipt_extracted_vendor })
  }
  return out
}
