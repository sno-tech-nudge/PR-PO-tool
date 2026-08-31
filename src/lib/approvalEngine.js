// PR approval chain — fixed for every PR regardless of amount:
// Functional Leader → PR Approver → PO Approver (Finance issues the PO;
// handled as a separate stage in prApprovalActions.js/PODetail.jsx, not a
// pr_approvals row). `role` here is persisted as pr_approvals.required_role
// so PRDetail.jsx can gate each level to the matching team_members role.
export function getPRApprovalLevels() {
  return [
    { level: 1, role: 'fl',          label: 'Functional Leader' },
    { level: 2, role: 'pr_approver', label: 'PR Approver' },
  ]
}

// Minimum quotes required per policy
// ₹25k–₹2L → 2 quotes; >₹2L → 3 quotes
export function getRequiredQuotes(amount) {
  if (amount > 200000) return 3
  return 2
}

// Advance-payment policy flags.
// > 30% advance → flagged (warn, but submission still allowed)
// 100% advance  → requires Functional Leader approval over email (recorded acknowledgement)
export function getAdvanceFlags(advancePercent) {
  const pct = Number(advancePercent) || 0
  return {
    flaggedOver30:   pct > 30,
    requiresFLEmail: pct >= 100,
  }
}

export function getApprovalLevels(totalAmount) {
  if (totalAmount <= 50000) {
    return [{ level: 1, role: 'reporting_manager', label: 'Reporting Manager' }]
  }
  if (totalAmount <= 200000) {
    return [
      { level: 1, role: 'reporting_manager', label: 'Reporting Manager' },
      { level: 2, role: 'functional_lead', label: 'Functional Lead' },
    ]
  }
  return [
    { level: 1, role: 'reporting_manager', label: 'Reporting Manager' },
    { level: 2, role: 'functional_lead', label: 'Functional Lead' },
    { level: 3, role: 'coo', label: 'COO' },
  ]
}

export async function createApprovalRecords(reportId, totalAmount, supabaseClient) {
  const levels = getApprovalLevels(totalAmount)
  const dueAt = new Date()
  dueAt.setHours(dueAt.getHours() + 48)

  const records = levels.map(level => ({
    report_id: reportId,
    approver_level: level.role,
    approver_name: level.label,
    status: level.level === 1 ? 'pending' : 'waiting',
    due_at: dueAt.toISOString(),
  }))

  const { error } = await supabaseClient.from('report_approvals').insert(records)
  if (error) console.log('Approval records error:', error.message)
}

export async function processApproval(
  reportId,
  approverLevel,
  action,
  notes,
  supabaseClient,
  approverEmail
) {
  const now = new Date().toISOString()

  await supabaseClient
    .from('report_approvals')
    .update({ status: action, notes, actioned_at: now, approver_email: approverEmail || null })
    .eq('report_id', reportId)
    .eq('approver_level', approverLevel)

  if (action === 'approved') {
    const { data: nextApproval } = await supabaseClient
      .from('report_approvals')
      .select('*')
      .eq('report_id', reportId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (nextApproval) {
      await supabaseClient
        .from('report_approvals')
        .update({ status: 'pending' })
        .eq('id', nextApproval.id)

      await supabaseClient
        .from('expense_reports')
        .update({ status: 'under_review', reviewed_by: approverLevel, reviewed_at: now })
        .eq('id', reportId)
    } else {
      await supabaseClient
        .from('expense_reports')
        .update({ status: 'approved', approved_at: now, reviewed_by: approverLevel, reviewed_at: now })
        .eq('id', reportId)
    }
  }

  if (action === 'rejected') {
    await supabaseClient
      .from('expense_reports')
      .update({
        status: 'rejected',
        rejection_reason: notes,
        rejected_at: now,
        reviewed_by: approverLevel,
        reviewed_at: now,
      })
      .eq('id', reportId)
  }
}

export async function createNotification(
  recipientId,
  reportId,
  type,
  message,
  supabaseClient,
  { relatedType, relatedId } = {}
) {
  const { error } = await supabaseClient
    .from('expense_notifications')
    .insert({ recipient_id: recipientId, report_id: reportId, type, message, related_type: relatedType || null, related_id: relatedId || null })
  if (error) console.log('Notification error:', error.message)
}

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export const STATUS_STEP = {
  submitted: 0,
  under_review: 1,
  approved: 2,
  processing: 3,
  reimbursed: 4,
  rejected: -1,
}

export const STATUS_LABEL = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  processing: 'Processing',
  reimbursed: 'Reimbursed',
  rejected: 'Rejected',
}
