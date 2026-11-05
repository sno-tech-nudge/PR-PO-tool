import { supabase } from './supabase'
import { payoutAmount } from './advanceBalance'
import { sendReportEmail } from './reportEmail'
import { logActivity } from './activityLog'

// Marks approved reports as reimbursed (paid). Used by Finance, Pending Payments and by All Reports,
// so both do exactly the same thing. Only reports that are still "approved" are changed, so a report
// someone else already marked (or sent back) is never overwritten.
//   notify: tell each employee by email that it has been paid (turn off for old reports whose
//           employees were already paid and told).
export async function markReportsReimbursed(reports, { user, notify = true } = {}) {
  const wanted = (reports || []).filter(r => r.status === 'approved' || r.status == null)
  if (!wanted.length) return { ok: false, error: 'None of these reports are approved, so there is nothing to mark.' }

  const { data, error } = await supabase
    .from('expense_reports')
    .update({ status: 'reimbursed', reimbursed_at: new Date().toISOString() })
    .in('id', wanted.map(r => r.id))
    .eq('status', 'approved')
    .select('id')
  if (error) return { ok: false, error: 'Could not mark as reimbursed. Please try again.' }

  const doneIds = new Set((data || []).map(r => r.id))
  for (const r of wanted.filter(r => doneIds.has(r.id))) {
    logActivity({
      entityType: 'report', entityId: r.id, entityRef: r.report_reference, action: 'status_change',
      fromValue: 'approved', toValue: 'reimbursed', actor: user,
      note: notify ? null : 'Employee was not emailed',
    })
    if (notify && r.employee_email) {
      sendReportEmail({
        type: 'finalized', recipientEmail: r.employee_email, reportReference: r.report_reference,
        amount: payoutAmount(r), currentStep: 4,
      })
    }
  }
  return { ok: true, ids: [...doneIds], skipped: wanted.length - doneIds.size }
}
