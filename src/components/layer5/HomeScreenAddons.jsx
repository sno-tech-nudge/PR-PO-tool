import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { canAccessApprovals, canAccessFinance, isObserver } from '../../lib/auth'
import { STATUS_STEP } from '../../lib/approvalEngine'
import { avgTAT } from '../../lib/tat'
import StatusTimeline from './StatusTimeline'

// Statuses that mean "still moving through the pipeline" — not a draft,
// and not fully resolved yet (paid/reimbursed or rejected/turned into a PO).
const PR_PIPELINE_STATUSES = ['submitted', 'approved']
const REPORT_PIPELINE_STATUSES = ['submitted', 'under_review', 'approved', 'processing']
const APPROVER_QUEUE_ROLES = ['fl', 'finance', 'coo']

const POLICY_REMINDERS = [
  { text: 'Submit receipts within 7 days of purchase' },
  { text: 'Invoice required for expenses above ₹500' },
  { text: 'Meals capped at ₹750 per person per day' },
  { text: 'Hotel max ₹3,250/night (non-metro), ₹4,000 (metro)' },
]

const STATUS_BADGE = {
  draft:        { label: 'Draft',      color: 'var(--text-muted)', bg: 'var(--taupe-100)' },
  submitted:    { label: 'Submitted',  color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  under_review: { label: 'In Review',  color: 'var(--action)', bg: 'var(--action-bg)' },
  approved:     { label: 'Approved',   color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  rejected:     { label: 'Returned',   color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
  processing:   { label: 'Processing', color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  reimbursed:   { label: 'Reimbursed', color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
}

function TaskRow({ title, subtitle, badge, badgeColor, badgeBg, last, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '13px 16px',
        borderBottom: last ? 'none' : '1px solid var(--taupe-100)',
        background: 'var(--surface-card)',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{
          fontSize: '11px', fontWeight: 600,
          padding: '3px 8px', borderRadius: 'var(--radius-md)',
          background: badgeBg, color: badgeColor,
        }}>
          {badge}
        </span>
        <span style={{ fontSize: '16px', color: 'var(--taupe-400)' }}>›</span>
      </div>
    </div>
  )
}

export default function HomeScreenAddons({
  user, onViewReport,
  onResumePRDraft, onResumeVendorDraft,
  onOpenExpenseApprovals, onOpenPRApprovals, onOpenFinance,
  onViewPR, onViewVendor, onOpenReportApproval,
  hideExpenseFeatures = false,
}) {
  const [stats, setStats]                 = useState(null)
  const [recentReports, setRecentReports] = useState([])
  const [tasks, setTasks]                 = useState(null)
  const [loading, setLoading]             = useState(true)
  const [recentActivity, setRecentActivity] = useState([])
  const [approvalQueue, setApprovalQueue] = useState([])
  const [personalMini, setPersonalMini]   = useState(null)

  useEffect(() => { load() }, [user?.email, hideExpenseFeatures])

  async function load() {
    const email = user?.email
    const role = user?.role
    const canApprove = canAccessApprovals(role) && !isObserver(role)
    const canFinance = canAccessFinance(role)
    const isEmployee = role === 'employee'
    const showApproverQueue = APPROVER_QUEUE_ROLES.includes(role)
    // The small personal snapshot at the bottom of Home is additive to what
    // Finance/Admin already get via the full Finance Dashboard > Analytics
    // Personal Analytics section — skip it here to avoid showing the same
    // thing twice for that audience.
    const showPersonalMini = role === 'employee' || role === 'fl'

    const [
      { count: savedCount },
      { data: reports },
      { data: draftPRs },
      { data: draftVendors },
      { count: pendingExpenseReports },
      { count: pendingPRs },
      { count: pendingPOs },
      { data: recentPRs },
      { data: recentVendors },
      { data: approvalRows },
      { count: raisedPRCount },
      { count: raisedVendorCount },
      { count: raisedReportCount },
      { data: myPRApprovals },
      { data: myReportApprovals },
      { data: pipelineReports },
    ] = await Promise.all([
      hideExpenseFeatures
        ? Promise.resolve({ count: 0 })
        : supabase.from('expense_details')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'saved')
            .eq('user_email', email),
      hideExpenseFeatures
        ? Promise.resolve({ data: [] })
        : supabase.from('expense_reports')
            .select('id,report_reference,total_amount,status,created_at,brand')
            .eq('employee_email', email)
            .not('status', 'eq', 'saved')
            .order('created_at', { ascending: false })
            .limit(50),
      supabase.from('purchase_requests')
        .select('id, pr_number, amount, vendors(org_name)')
        .eq('requested_by', email)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('vendors')
        .select('id, org_name, vendor_id')
        .eq('submitted_by', email)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(5),
      canApprove
        ? supabase.from('expense_reports').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review'])
        : Promise.resolve({ count: 0 }),
      canApprove
        ? supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'submitted')
        : Promise.resolve({ count: 0 }),
      canFinance
        ? supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval')
        : Promise.resolve({ count: 0 }),
      // Recent activity (employees) — most recently created non-draft PR/
      // Vendor of theirs, merged with the already-fetched `reports` list.
      isEmployee
        ? supabase.from('purchase_requests')
            .select('id, pr_number, amount, status, created_at')
            .eq('requested_by', email)
            .not('status', 'eq', 'draft')
            .order('created_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
      isEmployee
        ? supabase.from('vendors')
            .select('id, org_name, vendor_id, status, created_at')
            .eq('submitted_by', email)
            .not('status', 'eq', 'draft')
            .order('created_at', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] }),
      // "Needs your approval" preview (FL/Finance/COO) — reports that have
      // just landed at a level this person can act on (same coarse-fallback
      // vs required_role logic as canAccessApprovals/ApproverReportView).
      showApproverQueue
        ? supabase.from('report_approvals')
            .select('id, created_at, report:expense_reports(id, report_reference, total_amount, status, employee_email)')
            .eq('status', 'pending')
            .or(`required_role.eq.${role},required_role.is.null`)
            .order('created_at', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] }),
      showPersonalMini
        ? supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('requested_by', email).not('status', 'eq', 'draft')
        : Promise.resolve({ count: 0 }),
      showPersonalMini
        ? supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('submitted_by', email).not('status', 'eq', 'draft')
        : Promise.resolve({ count: 0 }),
      showPersonalMini
        ? supabase.from('expense_reports').select('id', { count: 'exact', head: true }).eq('employee_email', email).not('status', 'eq', 'saved')
        : Promise.resolve({ count: 0 }),
      role === 'fl'
        ? supabase.from('pr_approvals').select('status, created_at, actioned_at').eq('approver_email', email).in('status', ['approved', 'rejected'])
        : Promise.resolve({ data: [] }),
      role === 'fl'
        ? supabase.from('report_approvals').select('status, created_at, actioned_at').eq('approver_email', email).in('status', ['approved', 'rejected'])
        : Promise.resolve({ data: [] }),
      // Report amounts for the "In Pipeline" total — fetched independently
      // of `hideExpenseFeatures` (which only hides the report *list*/detail
      // UI for employees during this testing round) so the pipeline figure
      // stays honest even while that list itself stays hidden.
      isEmployee
        ? supabase.from('expense_reports').select('total_amount, status').eq('employee_email', email).in('status', REPORT_PIPELINE_STATUSES)
        : Promise.resolve({ data: [] }),
    ])

    const reps = reports || []
    // "Approved" reports are, in practice, almost always already paid out —
    // Finance frequently settles them outside a formal "mark as reimbursed"
    // step in the tool — so the Reimbursed total counts both, not just the
    // strictly-reimbursed ones, to reflect what's actually been paid.
    const reimburseTotal = reps
      .filter(r => r.status === 'reimbursed' || r.status === 'approved')
      .reduce((s, r) => s + (r.total_amount || 0), 0)

    setStats({
      unreported: savedCount || 0,
      inReview:   reps.filter(r => ['submitted','under_review'].includes(r.status)).length,
      reimbursed: reimburseTotal,
    })
    setRecentReports(reps.slice(0, 3))
    setTasks({
      draftPRs: draftPRs || [],
      draftVendors: draftVendors || [],
      pendingExpenseReports: pendingExpenseReports || 0,
      pendingPRs: pendingPRs || 0,
      pendingPOs: pendingPOs || 0,
    })

    if (isEmployee) {
      const merged = [
        ...reps.map(r => ({ id: r.id, type: 'report', title: r.report_reference, subtitle: r.total_amount ? `₹${Number(r.total_amount).toLocaleString('en-IN')}` : '—', status: r.status, date: r.created_at })),
        ...(recentPRs || []).map(pr => ({ id: pr.id, type: 'pr', title: `PR ${pr.pr_number || ''}`.trim(), subtitle: pr.amount ? `₹${Number(pr.amount).toLocaleString('en-IN')}` : '—', status: pr.status, date: pr.created_at })),
        ...(recentVendors || []).map(v => ({ id: v.id, type: 'vendor', title: v.org_name || 'Vendor', subtitle: v.vendor_id || '—', status: v.status, date: v.created_at })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date))
      setRecentActivity(merged.slice(0, 2))
    }

    if (showApproverQueue) {
      setApprovalQueue((approvalRows || []).map(a => a.report).filter(Boolean))
    }

    if (showPersonalMini) {
      const raised = (raisedPRCount || 0) + (raisedVendorCount || 0) + (raisedReportCount || 0)
      if (role === 'fl') {
        const allApprovals = [...(myPRApprovals || []), ...(myReportApprovals || [])]
        const approvedRows = allApprovals.filter(a => a.status === 'approved')
        setPersonalMini({
          raised,
          approvedCount: approvedRows.length,
          rejectedCount: allApprovals.filter(a => a.status === 'rejected').length,
          avgDays: avgTAT(approvedRows, 'created_at', 'actioned_at'),
        })
      } else {
        const pipelineTotal =
          (pipelineReports || []).reduce((s, r) => s + (r.total_amount || 0), 0) +
          (recentPRs || []).filter(pr => PR_PIPELINE_STATUSES.includes(pr.status)).reduce((s, pr) => s + (Number(pr.amount) || 0), 0)
        setPersonalMini({ raised, pipelineTotal })
      }
    }

    setLoading(false)
  }

  const hasTasks = tasks && (
    tasks.draftPRs.length > 0 || tasks.draftVendors.length > 0 ||
    tasks.pendingExpenseReports > 0 || tasks.pendingPRs > 0 || tasks.pendingPOs > 0
  )

  if (loading) return (
    <div>
      <div style={{ height: '76px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-lg)', marginBottom: '20px' }} />
      <div style={{ height: '130px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-lg)' }} />
    </div>
  )

  return (
    <div>
      {/* Expense reporting stats/history are out of scope for this testing
          round (Vendor/PR/PO only) — show a plain status card instead. */}
      {hideExpenseFeatures && (
        <div style={{ background: 'var(--taupe-50)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Expense reporting</span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-md)', background: 'var(--taupe-100)', color: 'var(--text-muted)' }}>
              Coming soon
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            We're currently testing Vendor, Purchase Request, and Purchase Order workflows. Expense capture and reports will open up here soon.
          </div>
        </div>
      )}

      {/* Stat cards */}
      {!hideExpenseFeatures && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
          <div style={{ background: 'var(--taupe-50)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: '14px 12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{stats.unreported}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.3 }}>Unreported</div>
          </div>
          <div style={{ background: 'var(--action-bg)', border: '1px solid var(--action-bg)', borderRadius: 'var(--radius-lg)', padding: '14px 12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--action)', lineHeight: 1 }}>{stats.inReview}</div>
            <div style={{ fontSize: '11px', color: 'var(--action)', opacity: 0.8, marginTop: '5px', lineHeight: 1.3 }}>In Review</div>
          </div>
          <div style={{ background: 'var(--moss-bg)', border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-lg)', padding: '14px 12px' }}>
            <div style={{ fontSize: stats.reimbursed >= 10000 ? '15px' : '20px', fontWeight: 800, color: 'var(--moss-text)', lineHeight: 1 }}>
              ₹{stats.reimbursed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--moss-text)', opacity: 0.8, marginTop: '5px', lineHeight: 1.3 }}>Reimbursed</div>
          </div>
        </div>
      )}

      {/* Pending tasks — drafts you can resume, plus anything waiting on
          your role to approve. Only rendered when there's actually
          something to do, so Home stays uncluttered otherwise. */}
      {hasTasks && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Pending Tasks
          </div>
          <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {tasks.draftPRs.map((pr, i, arr) => (
              <TaskRow
                key={`pr-draft-${pr.id}`}
                title={pr.vendors?.org_name || pr.pr_number || 'Purchase Request draft'}
                subtitle={`${pr.pr_number || 'Draft'}${pr.amount ? ` · ₹${Number(pr.amount).toLocaleString('en-IN')}` : ''}`}
                badge="Draft"
                badgeColor="var(--text-muted)" badgeBg="var(--taupe-100)"
                last={i === arr.length - 1 && tasks.draftVendors.length === 0 && tasks.pendingExpenseReports === 0 && tasks.pendingPRs === 0 && tasks.pendingPOs === 0}
                onClick={() => onResumePRDraft?.(pr.id)}
              />
            ))}
            {tasks.draftVendors.map((v, i, arr) => (
              <TaskRow
                key={`vendor-draft-${v.id}`}
                title={v.org_name || 'Vendor draft'}
                subtitle={v.vendor_id || 'Not yet submitted'}
                badge="Draft"
                badgeColor="var(--text-muted)" badgeBg="var(--taupe-100)"
                last={i === arr.length - 1 && tasks.pendingExpenseReports === 0 && tasks.pendingPRs === 0 && tasks.pendingPOs === 0}
                onClick={() => onResumeVendorDraft?.(v.id)}
              />
            ))}
            {tasks.pendingExpenseReports > 0 && (
              <TaskRow
                title="Expense reports awaiting your review"
                subtitle={`${tasks.pendingExpenseReports} report${tasks.pendingExpenseReports === 1 ? '' : 's'} pending`}
                badge={tasks.pendingExpenseReports}
                badgeColor="var(--action)" badgeBg="var(--action-bg)"
                last={tasks.pendingPRs === 0 && tasks.pendingPOs === 0}
                onClick={onOpenExpenseApprovals}
              />
            )}
            {tasks.pendingPRs > 0 && (
              <TaskRow
                title="Purchase requests awaiting your review"
                subtitle={`${tasks.pendingPRs} request${tasks.pendingPRs === 1 ? '' : 's'} pending`}
                badge={tasks.pendingPRs}
                badgeColor="var(--action)" badgeBg="var(--action-bg)"
                last={tasks.pendingPOs === 0}
                onClick={onOpenPRApprovals}
              />
            )}
            {tasks.pendingPOs > 0 && (
              <TaskRow
                title="Purchase orders awaiting approval"
                subtitle={`${tasks.pendingPOs} order${tasks.pendingPOs === 1 ? '' : 's'} pending`}
                badge={tasks.pendingPOs}
                badgeColor="var(--action)" badgeBg="var(--action-bg)"
                last
                onClick={onOpenFinance}
              />
            )}
          </div>
        </div>
      )}

      {/* Needs your approval — FL/Finance/COO, the reports that most
          recently landed at a level they can act on. One click straight
          into the approval screen, same as picking it from the full list. */}
      {approvalQueue.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Needs Your Approval
          </div>
          <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {approvalQueue.map((rep, i) => (
              <div
                key={rep.id}
                onClick={() => onOpenReportApproval?.(rep.id)}
                style={{
                  padding: '13px 16px',
                  borderBottom: i < approvalQueue.length - 1 ? '1px solid var(--taupe-100)' : 'none',
                  background: 'var(--surface-card)', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace' }}>{rep.report_reference}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {rep.employee_email} · {rep.total_amount ? `₹${Number(rep.total_amount).toLocaleString('en-IN')}` : '—'}
                    </div>
                  </div>
                  <span style={{ fontSize: '16px', color: 'var(--taupe-400)' }}>›</span>
                </div>
                <StatusTimeline currentStep={STATUS_STEP[rep.status] ?? 0} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity (employees) — most recent PR/Report/Vendor they
          raised, superseding the plain "Recent Reports" list below (which
          only ever covered expense reports) for this audience. */}
      {recentActivity.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Recent Activity
          </div>
          <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {recentActivity.map((item, i) => {
              const badge = STATUS_BADGE[item.status] || STATUS_BADGE.submitted
              const onClick = item.type === 'pr' ? () => onViewPR?.(item.id)
                : item.type === 'vendor' ? () => onViewVendor?.(item.id)
                : () => onViewReport?.(item.id)
              return (
                <TaskRow
                  key={`${item.type}-${item.id}`}
                  title={item.title}
                  subtitle={item.subtitle}
                  badge={badge.label} badgeColor={badge.color} badgeBg={badge.bg}
                  last={i === recentActivity.length - 1}
                  onClick={onClick}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Recent reports */}
      {!hideExpenseFeatures && recentActivity.length === 0 && recentReports.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Recent Reports
          </div>
          <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {recentReports.map((rep, i) => {
              const badge = STATUS_BADGE[rep.status] || STATUS_BADGE.submitted
              return (
                <div
                  key={rep.id}
                  onClick={() => onViewReport && onViewReport(rep.id)}
                  style={{
                    padding: '13px 16px',
                    borderBottom: i < recentReports.length - 1 ? '1px solid var(--taupe-100)' : 'none',
                    background: 'var(--surface-card)',
                    cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace', marginBottom: '2px' }}>
                      {rep.report_reference}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {rep.total_amount ? `₹${Number(rep.total_amount).toLocaleString('en-IN')}` : '—'}
                      {rep.brand ? ` · ${rep.brand}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      padding: '3px 8px', borderRadius: 'var(--radius-md)',
                      background: badge.bg, color: badge.color,
                    }}>
                      {badge.label}
                    </span>
                    <span style={{ fontSize: '16px', color: 'var(--taupe-400)' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Policy reminders */}
      {!hideExpenseFeatures && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Policy Reminders
          </div>
          <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {POLICY_REMINDERS.map((r, i) => (
              <div key={i} style={{
                padding: '11px 14px',
                borderBottom: i < POLICY_REMINDERS.length - 1 ? '1px solid var(--taupe-100)' : 'none',
                background: 'var(--taupe-50)',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '18px' }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal snapshot — a small always-visible summary for employees
          and FL specifically; Finance/Admin already get the full version
          via Finance Dashboard > Analytics > Personal Analytics. */}
      {personalMini && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Your Activity
          </div>
          <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
            <div style={{ display: 'flex', gap: '24px', marginBottom: personalMini.approvedCount != null || personalMini.pipelineTotal != null ? '16px' : 0 }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{personalMini.raised}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Raised</div>
              </div>
              {personalMini.pipelineTotal != null && (
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--action)', lineHeight: 1 }}>
                    ₹{personalMini.pipelineTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>In Pipeline</div>
                </div>
              )}
              {personalMini.avgDays != null && (
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{personalMini.avgDays}d</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Avg Turnaround</div>
                </div>
              )}
            </div>

            {personalMini.approvedCount != null && (
              <div>
                {[
                  { label: 'Approved', value: personalMini.approvedCount, color: 'var(--moss)' },
                  { label: 'Rejected', value: personalMini.rejectedCount, color: 'var(--clay)' },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--ink)' }}>{row.label}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>{row.value}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-xs)' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.max(personalMini.approvedCount, personalMini.rejectedCount, 1) ? (row.value / Math.max(personalMini.approvedCount, personalMini.rejectedCount, 1)) * 100 : 0}%`,
                        background: row.color, borderRadius: 'var(--radius-xs)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
