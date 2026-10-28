import { supabase } from './supabase'
import { logActivity } from './activityLog'

const lower = s => String(s || '').toLowerCase()

// Deletes a draft report that was never submitted. Only the draft itself goes:
// its expenses are kept, back in My Expenses with their receipts, so nothing
// anyone captured is lost. Checked against the database right now, not the screen:
// it must still be a draft and belong to the person asking.
// Returns { ok: true, kept } or { ok: false, reason }.
export async function deleteDraftReport(report, user) {
  const { data: fresh, error: readErr } = await supabase
    .from('expense_reports')
    .select('id, report_reference, status, employee_email')
    .eq('id', report.id)
    .maybeSingle()
  if (readErr) return { ok: false, reason: `Could not check this draft: ${readErr.message}` }
  if (!fresh) return { ok: true, kept: 0 } // already gone
  if (fresh.status !== 'draft') return { ok: false, reason: 'Only a draft that has not been submitted can be deleted.' }
  const mine = (user?.ownEmails?.length ? user.ownEmails : [user?.email]).map(lower)
  if (!mine.includes(lower(fresh.employee_email))) return { ok: false, reason: 'This draft belongs to someone else.' }

  const { count } = await supabase.from('expense_details').select('id', { count: 'exact', head: true }).eq('report_id', fresh.id)
  const { error: unlinkErr } = await supabase.from('expense_details').update({ report_id: null }).eq('report_id', fresh.id)
  if (unlinkErr) return { ok: false, reason: `Could not release the expenses: ${unlinkErr.message}` }
  await supabase.from('purchase_requests').update({ linked_expense_report_id: null }).eq('linked_expense_report_id', fresh.id)

  const { error } = await supabase.from('expense_reports').delete().eq('id', fresh.id).eq('status', 'draft')
  if (error) return { ok: false, reason: `Could not delete the draft: ${error.message}` }

  logActivity({
    entityType: 'report', entityId: fresh.id, entityRef: fresh.report_reference, action: 'draft_deleted',
    fromValue: 'draft', actor: user,
    note: count ? `${count} expense${count === 1 ? '' : 's'} kept in My Expenses` : null,
  })
  return { ok: true, kept: count || 0 }
}
