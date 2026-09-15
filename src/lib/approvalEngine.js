import { sendReportEmail } from './reportEmail'
import { getApproverEmailsForLevel, getEmailsByRole } from './auth'

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

// Fallback used only when no active rule matches (nothing seeded yet, or the
// fetch hasn't resolved) — kept byte-identical to what this function always
// did before rules became configurable, so a missing/empty rules table never
// changes real behavior.
function fallbackLevels(totalAmount) {
  if (totalAmount <= 50000) {
    return [{ level: 1, role: 'level_1', label: 'Reporting Manager', requiredRole: null }]
  }
  if (totalAmount <= 200000) {
    return [
      { level: 1, role: 'level_1', label: 'Reporting Manager', requiredRole: null },
      { level: 2, role: 'level_2', label: 'Functional Lead', requiredRole: 'fl' },
    ]
  }
  return [
    { level: 1, role: 'level_1', label: 'Reporting Manager', requiredRole: null },
    { level: 2, role: 'level_2', label: 'Functional Lead', requiredRole: 'fl' },
    { level: 3, role: 'level_3', label: 'COO', requiredRole: 'coo' },
  ]
}

// Admin/finance-configurable approval rules — Settings > Custom Approval,
// backed by the approval_rules table (supabase_migration_approval_rules.sql).
// Fetched once per flow (not per keystroke) and passed into the pure
// matching functions below, so the same rule set drives both the
// pre-submission "Approval route" preview (policyEngine.js
// determineApprovalRoute) and the records actually created here — the two
// used to be independently hardcoded and could silently disagree.
export async function getApprovalRules(supabaseClient) {
  const { data } = await supabaseClient
    .from('approval_rules')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return data || []
}

function matchRule(rules, totalAmount) {
  return (rules || []).find(r =>
    (r.min_amount == null || totalAmount > Number(r.min_amount)) &&
    (r.max_amount == null || totalAmount <= Number(r.max_amount))
  )
}

// requiredRole gates who can actually act on that level (mirrors
// pr_approvals.required_role / PRDetail.jsx's roleMatches) — it's a
// team_members.role value, not the approver_level label. A level with no
// required_role (e.g. today's "Reporting Manager", which has no natural 1:1
// role in the roster) stays null — canAccessApprovals' coarse fallback
// applies, same as legacy rows created before required_role existed.
//
// Returns either a levels array, or { autoMode: 'approved' | 'rejected' }
// for a rule configured as Auto Approve / Auto Reject.
export function getApprovalLevels(totalAmount, rules) {
  const rule = matchRule(rules, totalAmount)
  if (!rule) return fallbackLevels(totalAmount)
  if (rule.mode === 'auto_approve') return { autoMode: 'approved', ruleName: rule.name }
  if (rule.mode === 'auto_reject') return { autoMode: 'rejected', ruleName: rule.name }
  return (rule.levels || []).map((lvl, i) => ({
    level: i + 1, role: `level_${i + 1}`, label: lvl.label, requiredRole: lvl.required_role || null,
  }))
}

export async function createApprovalRecords(reportId, totalAmount, supabaseClient) {
  const rules = await getApprovalRules(supabaseClient)
  const levels = getApprovalLevels(totalAmount, rules)

  if (levels.autoMode) {
    const now = new Date().toISOString()
    const status = levels.autoMode
    const patch = status === 'approved'
      ? { status: 'approved', approved_at: now, reviewed_by: 'auto_rule', reviewed_at: now }
      : { status: 'rejected', rejected_at: now, reviewed_by: 'auto_rule', reviewed_at: now, rejection_reason: `Auto-rejected by approval rule "${levels.ruleName}".` }
    const { error } = await supabaseClient.from('expense_reports').update(patch).eq('id', reportId)
    if (error) console.log('Auto-approval update error:', error.message)

    const { data: report } = await supabaseClient
      .from('expense_reports')
      .select('report_reference, total_amount, employee_email')
      .eq('id', reportId)
      .maybeSingle()
    if (report) {
      sendReportEmail({
        type: status === 'approved' ? 'advanced' : 'rejected',
        recipientEmail: report.employee_email, reportReference: report.report_reference,
        amount: report.total_amount, actorName: 'Approval rules', reason: patch.rejection_reason,
        nextLevelLabel: status === 'approved' ? 'Finance (reimbursement processing)' : undefined,
      })
    }
    return
  }

  const dueAt = new Date()
  dueAt.setHours(dueAt.getHours() + 48)

  const records = levels.map(level => ({
    report_id: reportId,
    approver_level: level.role,
    approver_name: level.label,
    required_role: level.requiredRole,
    status: level.level === 1 ? 'pending' : 'waiting',
    due_at: dueAt.toISOString(),
  }))

  // onConflict + ignoreDuplicates makes this safe to call more than once for
  // the same report (StrictMode double-invoke, a remounted confirmation
  // screen, etc.) — relies on the report_approvals_report_level_unique
  // constraint (report_id, approver_level) from
  // supabase_migration_report_approvals_unique.sql.
  const { error } = await supabaseClient
    .from('report_approvals')
    .upsert(records, { onConflict: 'report_id,approver_level', ignoreDuplicates: true })
  if (error) console.log('Approval records error:', error.message)
}

export async function processApproval(
  reportId,
  approverLevel,
  action,
  notes,
  supabaseClient,
  approverEmail,
  report,
  approverName
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

      sendReportEmail({
        type: 'advanced', recipientEmail: report?.employee_email, reportReference: report?.report_reference,
        amount: report?.total_amount, actorName: approverName, nextLevelLabel: nextApproval.approver_name, currentStep: 1,
      })
      getApproverEmailsForLevel(nextApproval.required_role).then(emails => sendReportEmail({
        type: 'action_needed', recipientEmail: emails, reportReference: report?.report_reference,
        amount: report?.total_amount, nextLevelLabel: nextApproval.approver_name,
      }))
    } else {
      await supabaseClient
        .from('expense_reports')
        .update({ status: 'approved', approved_at: now, reviewed_by: approverLevel, reviewed_at: now })
        .eq('id', reportId)

      sendReportEmail({
        type: 'advanced', recipientEmail: report?.employee_email, reportReference: report?.report_reference,
        amount: report?.total_amount, actorName: approverName, nextLevelLabel: 'Finance (reimbursement processing)', currentStep: 2,
      })
      getEmailsByRole('finance').then(emails => sendReportEmail({
        type: 'action_needed', recipientEmail: emails, reportReference: report?.report_reference,
        amount: report?.total_amount, nextLevelLabel: 'Finance processing',
      }))
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

    // Free the underlying expenses back into the 'saved' pool — submitting
    // flips them to 'reported' (see ReportPreview.jsx) so they stop showing
    // up as selectable in a new report; a rejection needs to undo exactly
    // that, or "edit and resubmit" would have nothing to resubmit.
    const { data: reportExpenses } = await supabaseClient
      .from('report_expenses')
      .select('expense_id')
      .eq('report_id', reportId)
    const expenseIds = (reportExpenses || []).map(re => re.expense_id)
    if (expenseIds.length > 0) {
      await supabaseClient.from('expense_details').update({ status: 'saved' }).in('id', expenseIds)
    }

    sendReportEmail({
      type: 'rejected', recipientEmail: report?.employee_email, reportReference: report?.report_reference,
      actorName: approverName, reason: notes,
    })
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
