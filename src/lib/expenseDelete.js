import { supabase } from './supabase'
import { logActivity } from './activityLog'

// Report statuses an expense can still be deleted from: nobody has seen the
// report yet (draft), or it was returned to its owner for changes (rejected).
const EDITABLE_REPORT_STATUSES = ['draft', 'rejected']

// Deletes one expense together with its receipt record and the stored files.
// Refuses anything that sits in a report that has been submitted onward,
// checked against the database right now rather than trusting the screen.
// Returns { ok: true } or { ok: false, reason }.
export async function deleteExpense(expense, user) {
  const { data: fresh, error: readErr } = await supabase
    .from('expense_details')
    .select('id, vendor, amount, status, report_id, capture_id')
    .eq('id', expense.id)
    .maybeSingle()
  if (readErr) return { ok: false, reason: `Could not check this expense: ${readErr.message}` }
  if (!fresh) return { ok: true } // already gone

  // Every report this expense belongs to must still be editable.
  const { data: links } = await supabase.from('report_expenses').select('report_id').eq('expense_id', fresh.id)
  const reportIds = [...new Set([...(links || []).map(l => l.report_id), fresh.report_id].filter(Boolean))]
  if (reportIds.length) {
    const { data: reports } = await supabase.from('expense_reports').select('id, status').in('id', reportIds)
    if ((reports || []).some(r => !EDITABLE_REPORT_STATUSES.includes(r.status))) {
      return { ok: false, reason: "This expense is part of a report that has already been submitted, so it can't be deleted." }
    }
  }

  // The receipt record is only removed when no other expense still uses it.
  let paths = []
  let removeCaptureId = null
  if (fresh.capture_id) {
    const { count } = await supabase.from('expense_details').select('id', { count: 'exact', head: true })
      .eq('capture_id', fresh.capture_id).neq('id', fresh.id)
    if (!count) {
      removeCaptureId = fresh.capture_id
      const { data: cap } = await supabase.from('expense_captures').select('receipt_storage_path, payment_storage_path').eq('id', fresh.capture_id).maybeSingle()
      paths = [cap?.receipt_storage_path, cap?.payment_storage_path].filter(Boolean)
    }
  }

  await supabase.from('report_expenses').delete().eq('expense_id', fresh.id)
  const { error: delErr } = await supabase.from('expense_details').delete().eq('id', fresh.id)
  if (delErr) return { ok: false, reason: `Could not delete: ${delErr.message}` }

  if (removeCaptureId) await supabase.from('expense_captures').delete().eq('id', removeCaptureId)
  if (paths.length) await supabase.storage.from('expense-documents').remove(paths)

  logActivity({
    entityType: 'expense', entityId: fresh.id, entityRef: fresh.vendor || 'Expense', action: 'deleted',
    note: `₹${Number(fresh.amount || 0).toLocaleString('en-IN')} · receipt removed`, actor: user,
  })
  return { ok: true }
}
