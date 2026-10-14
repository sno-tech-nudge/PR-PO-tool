import { supabase } from './supabase'
import { logActivity } from './activityLog'

// Who on the Accounts (Finance) team is processing which report. New reports
// are handed out automatically to whoever has the fewest open ones; anyone can
// claim or reassign, so the work always has a name against it.

const OPEN = ['under_review', 'approved', 'processing']

export async function listAccountsTeam() {
  const { data } = await supabase.from('team_members').select('name, email').eq('role', 'finance').order('name', { ascending: true })
  return data || []
}

export async function assignReport({ report, member, by }) {
  const patch = member
    ? { assigned_to_email: member.email, assigned_to_name: member.name || member.email, assigned_at: new Date().toISOString() }
    : { assigned_to_email: null, assigned_to_name: null, assigned_at: null }
  const { error } = await supabase.from('expense_reports').update(patch).eq('id', report.id)
  if (error) throw error
  logActivity({
    entityType: 'report', entityId: report.id, entityRef: report.report_reference,
    action: member ? 'assigned' : 'unassigned',
    fromValue: report.assigned_to_name || report.assigned_to_email || null,
    toValue: member ? (member.name || member.email) : null,
    actor: by || null,
  })
  if (member && by?.email !== member.email) {
    // Inserted directly (not via approvalEngine) so the two files do not import each other.
    supabase.from('expense_notifications').insert({
      recipient_id: member.email, report_id: report.id, type: 'assigned',
      message: `${report.report_reference} was assigned to you for processing.`, related_type: 'report', related_id: report.id,
    }).then(() => {})
  }
  return patch
}

// Gives an unassigned report to the Accounts team member with the fewest open
// reports (ties go to the first by name). Never throws: assignment is a
// convenience and must not hold up the approval it sits next to.
export async function autoAssignReport(reportId) {
  try {
    const { data: rep } = await supabase.from('expense_reports').select('id, report_reference, assigned_to_email, employee_email').eq('id', reportId).maybeSingle()
    if (!rep || rep.assigned_to_email) return null
    const team = (await listAccountsTeam()).filter(m => m.email && m.email !== rep.employee_email)
    if (!team.length) return null
    const { data: open } = await supabase.from('expense_reports').select('assigned_to_email').in('status', OPEN).not('assigned_to_email', 'is', null)
    const load = {}
    for (const r of open || []) load[r.assigned_to_email] = (load[r.assigned_to_email] || 0) + 1
    const pick = [...team].sort((a, b) => (load[a.email] || 0) - (load[b.email] || 0))[0]
    await assignReport({ report: rep, member: pick, by: null })
    return pick
  } catch (err) {
    console.error('auto-assign failed:', err)
    return null
  }
}
