import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { canAccessApprovals, canAccessFinance, isObserver } from '../../lib/auth'

const POLICY_REMINDERS = [
  { text: 'Submit receipts within 7 days of purchase' },
  { text: 'Invoice required for expenses above ₹500' },
  { text: 'Meals capped at ₹750 per person per day' },
  { text: 'Hotel max ₹3,250/night (non-metro), ₹4,000 (metro)' },
]

const STATUS_BADGE = {
  draft:        { label: 'Draft',      color: '#6B7280', bg: '#F3F4F6' },
  submitted:    { label: 'Submitted',  color: '#B45309', bg: '#FFFBEB' },
  under_review: { label: 'In Review',  color: '#8C3225', bg: '#fdf0ed' },
  approved:     { label: 'Approved',   color: '#15803D', bg: '#F0FDF4' },
  rejected:     { label: 'Returned',   color: '#B91C1C', bg: '#FEF2F2' },
  processing:   { label: 'Processing', color: '#6D28D9', bg: '#F5F3FF' },
  reimbursed:   { label: 'Reimbursed', color: '#15803D', bg: '#F0FDF4' },
}

function TaskRow({ title, subtitle, badge, badgeColor, badgeBg, last, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '13px 16px',
        borderBottom: last ? 'none' : '1px solid #F3F4F6',
        background: '#FFFFFF',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: '12px', color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{
          fontSize: '11px', fontWeight: 600,
          padding: '3px 8px', borderRadius: '5px',
          background: badgeBg, color: badgeColor,
        }}>
          {badge}
        </span>
        <span style={{ fontSize: '16px', color: '#D1D5DB' }}>›</span>
      </div>
    </div>
  )
}

export default function HomeScreenAddons({
  user, onViewReport,
  onResumePRDraft, onResumeVendorDraft,
  onOpenExpenseApprovals, onOpenPRApprovals, onOpenFinance,
}) {
  const [stats, setStats]                 = useState(null)
  const [recentReports, setRecentReports] = useState([])
  const [tasks, setTasks]                 = useState(null)
  const [loading, setLoading]             = useState(true)

  useEffect(() => { load() }, [user?.email])

  async function load() {
    const email = user?.email
    const canApprove = canAccessApprovals(user?.role) && !isObserver(user?.role)
    const canFinance = canAccessFinance(user?.role)

    const [
      { count: savedCount },
      { data: reports },
      { data: draftPRs },
      { data: draftVendors },
      { count: pendingExpenseReports },
      { count: pendingPRs },
      { count: pendingPOs },
    ] = await Promise.all([
      supabase.from('expense_details')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'saved')
        .eq('user_email', email),
      supabase.from('expense_reports')
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
    ])

    const reps = reports || []
    const reimburseTotal = reps
      .filter(r => r.status === 'reimbursed')
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
    setLoading(false)
  }

  const hasTasks = tasks && (
    tasks.draftPRs.length > 0 || tasks.draftVendors.length > 0 ||
    tasks.pendingExpenseReports > 0 || tasks.pendingPRs > 0 || tasks.pendingPOs > 0
  )

  if (loading) return (
    <div>
      <div style={{ height: '76px', background: '#F3F4F6', borderRadius: '10px', marginBottom: '20px' }} />
      <div style={{ height: '130px', background: '#F3F4F6', borderRadius: '10px' }} />
    </div>
  )

  return (
    <div>
      {/* Stat cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '24px' }}>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '14px 12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827', lineHeight: 1 }}>{stats.unreported}</div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '5px', lineHeight: 1.3 }}>Unreported</div>
          </div>
          <div style={{ background: '#fdf0ed', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '14px 12px' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#8C3225', lineHeight: 1 }}>{stats.inReview}</div>
            <div style={{ fontSize: '11px', color: '#8C3225', opacity: 0.8, marginTop: '5px', lineHeight: 1.3 }}>In Review</div>
          </div>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '14px 12px' }}>
            <div style={{ fontSize: stats.reimbursed >= 10000 ? '15px' : '20px', fontWeight: 800, color: '#15803D', lineHeight: 1 }}>
              ₹{stats.reimbursed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: '11px', color: '#15803D', opacity: 0.8, marginTop: '5px', lineHeight: 1.3 }}>Reimbursed</div>
          </div>
        </div>
      )}

      {/* Pending tasks — drafts you can resume, plus anything waiting on
          your role to approve. Only rendered when there's actually
          something to do, so Home stays uncluttered otherwise. */}
      {hasTasks && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Pending Tasks
          </div>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden' }}>
            {tasks.draftPRs.map((pr, i, arr) => (
              <TaskRow
                key={`pr-draft-${pr.id}`}
                title={pr.vendors?.org_name || pr.pr_number || 'Purchase Request draft'}
                subtitle={`${pr.pr_number || 'Draft'}${pr.amount ? ` · ₹${Number(pr.amount).toLocaleString('en-IN')}` : ''}`}
                badge="Draft"
                badgeColor="#6B7280" badgeBg="#F3F4F6"
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
                badgeColor="#6B7280" badgeBg="#F3F4F6"
                last={i === arr.length - 1 && tasks.pendingExpenseReports === 0 && tasks.pendingPRs === 0 && tasks.pendingPOs === 0}
                onClick={() => onResumeVendorDraft?.(v.id)}
              />
            ))}
            {tasks.pendingExpenseReports > 0 && (
              <TaskRow
                title="Expense reports awaiting your review"
                subtitle={`${tasks.pendingExpenseReports} report${tasks.pendingExpenseReports === 1 ? '' : 's'} pending`}
                badge={tasks.pendingExpenseReports}
                badgeColor="#8C3225" badgeBg="#fdf0ed"
                last={tasks.pendingPRs === 0 && tasks.pendingPOs === 0}
                onClick={onOpenExpenseApprovals}
              />
            )}
            {tasks.pendingPRs > 0 && (
              <TaskRow
                title="Purchase requests awaiting your review"
                subtitle={`${tasks.pendingPRs} request${tasks.pendingPRs === 1 ? '' : 's'} pending`}
                badge={tasks.pendingPRs}
                badgeColor="#8C3225" badgeBg="#fdf0ed"
                last={tasks.pendingPOs === 0}
                onClick={onOpenPRApprovals}
              />
            )}
            {tasks.pendingPOs > 0 && (
              <TaskRow
                title="Purchase orders awaiting approval"
                subtitle={`${tasks.pendingPOs} order${tasks.pendingPOs === 1 ? '' : 's'} pending`}
                badge={tasks.pendingPOs}
                badgeColor="#8C3225" badgeBg="#fdf0ed"
                last
                onClick={onOpenFinance}
              />
            )}
          </div>
        </div>
      )}

      {/* Recent reports */}
      {recentReports.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Recent Reports
          </div>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden' }}>
            {recentReports.map((rep, i) => {
              const badge = STATUS_BADGE[rep.status] || STATUS_BADGE.submitted
              return (
                <div
                  key={rep.id}
                  onClick={() => onViewReport && onViewReport(rep.id)}
                  style={{
                    padding: '13px 16px',
                    borderBottom: i < recentReports.length - 1 ? '1px solid #F3F4F6' : 'none',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: 'monospace', marginBottom: '2px' }}>
                      {rep.report_reference}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                      {rep.total_amount ? `₹${Number(rep.total_amount).toLocaleString('en-IN')}` : '—'}
                      {rep.brand ? ` · ${rep.brand}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      padding: '3px 8px', borderRadius: '5px',
                      background: badge.bg, color: badge.color,
                    }}>
                      {badge.label}
                    </span>
                    <span style={{ fontSize: '16px', color: '#D1D5DB' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Policy reminders */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
          Policy Reminders
        </div>
        <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden' }}>
          {POLICY_REMINDERS.map((r, i) => (
            <div key={i} style={{
              padding: '11px 14px',
              borderBottom: i < POLICY_REMINDERS.length - 1 ? '1px solid #F3F4F6' : 'none',
              background: '#FAFAFA',
            }}>
              <span style={{ fontSize: '12px', color: '#4B5563', lineHeight: '18px' }}>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
