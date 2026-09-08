import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/approvalEngine'

const STATUS_BADGE = {
  approved: { label: 'Approved', color: '#16A34A', bg: '#F0FDF4', icon: '✓' },
  rejected: { label: 'Returned', color: '#DC2626', bg: '#FEF2F2', icon: '✕' },
  processing: { label: 'Processing', color: '#CA8A04', bg: '#FEFCE8', icon: '◷' },
  reimbursed: { label: 'Reimbursed', color: '#16A34A', bg: '#F0FDF4', icon: '✓' },
}

const ROUTE_LABEL = {
  reporting_manager: 'Reporting Manager',
  manager_and_fl: 'Mgr + FL',
  manager_fl_coo: 'Mgr + FL + COO',
}

function ReportCard({ report, onClick, showSLA = true }) {
  // due_at lives on the report's current pending report_approvals row
  // (joined in on the parent query); fall back to a flat 48h-from-submit
  // estimate for any report where that join came back empty.
  const dueAt = report.due_at
    ? new Date(report.due_at).getTime()
    : new Date(report.submitted_at || report.created_at).getTime() + 48 * 3600000
  const hoursLeft = (dueAt - Date.now()) / 3600000
  const isOverdue = hoursLeft <= 0
  const isWarning = !isOverdue && hoursLeft <= 12

  // Left border gives approvers a triage signal without opening each card —
  // red once past due_at, amber once inside the last 12 hours of the 48h
  // SLA window, transparent otherwise.
  const urgencyBorder = showSLA ? (isOverdue ? '#DC2626' : isWarning ? '#CA8A04' : 'transparent') : 'transparent'

  return (
    <div
      onClick={() => onClick(report.id)}
      style={{
        border: '1px solid #E8E8E8', borderLeft: `4px solid ${urgencyBorder}`,
        marginBottom: '12px', cursor: 'pointer', overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
            {report.entity || 'Team Member'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
            {report.total_amount ? `₹${Number(report.total_amount).toLocaleString('en-IN')}` : '—'}
          </div>
        </div>

        {/* Second row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
            {report.expense_count || 0} expense{report.expense_count !== 1 ? 's' : ''}{report.entity ? ` · ${report.entity}` : ''}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
            {timeAgo(report.submitted_at || report.created_at)}
          </div>
        </div>

        {/* Third row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', color: '#6B6B6B', fontFamily: 'monospace' }}>
            {report.report_reference || '—'}
          </div>
          {showSLA ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', padding: '2px 8px', borderRadius: '2px',
              background: '#F7F7F7', color: '#6B6B6B',
            }}>
              <span style={{ fontSize: '11px' }}>◷</span>
              {ROUTE_LABEL[report.approval_route] || '—'}
            </div>
          ) : (
            STATUS_BADGE[report.status] && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '2px',
                background: STATUS_BADGE[report.status].bg,
                color: STATUS_BADGE[report.status].color,
              }}>
                <span style={{ fontSize: '11px' }}>{STATUS_BADGE[report.status].icon}</span>
                {STATUS_BADGE[report.status].label}
              </div>
            )
          )}
        </div>
      </div>

      {/* SLA indicator */}
      {showSLA && isOverdue && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 16px',
          background: '#FEF2F2', borderTop: '1px solid #DC2626',
          fontSize: '11px', color: '#DC2626',
        }}>
          <span style={{ fontSize: '12px' }}>⚠</span>
          Overdue by {Math.ceil(-hoursLeft)} hour{Math.ceil(-hoursLeft) !== 1 ? 's' : ''}.
        </div>
      )}
      {showSLA && isWarning && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 16px',
          background: '#FEFCE8', borderTop: '1px solid #CA8A04',
          fontSize: '11px', color: '#CA8A04',
        }}>
          <span style={{ fontSize: '12px' }}>◷</span>
          {Math.floor(hoursLeft)} hour{Math.floor(hoursLeft) !== 1 ? 's' : ''} left to review.
        </div>
      )}
    </div>
  )
}

export default function ApproverDashboard({ onViewReport, onBack }) {
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState([])
  const [reviewed, setReviewed] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Embed the report's currently-pending approval level to read its
      // real due_at — !inner turns this into an actual join filter so a
      // report with no 'pending' row (nothing left to embed) doesn't come
      // back with a dangling empty array instead of being excluded.
      const { data: pend } = await supabase
        .from('expense_reports')
        .select('*, report_approvals!inner(due_at, status)')
        .in('status', ['submitted', 'under_review'])
        .eq('report_approvals.status', 'pending')
        .order('created_at', { ascending: false })

      const { data: rev } = await supabase
        .from('expense_reports')
        .select('*')
        .in('status', ['approved', 'rejected', 'processing', 'reimbursed'])
        .order('created_at', { ascending: false })
        .limit(20)

      setPending((pend || []).map(r => ({ ...r, due_at: r.report_approvals?.[0]?.due_at || null })))
      setReviewed(rev || [])
      setLoading(false)
    }
    load()
  }, [])

  const displayList = tab === 'pending' ? pending : reviewed

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {onBack && (
          <div onClick={onBack} style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
            ← Back
          </div>
        )}
        <div>
          <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Approvals</div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A' }}>Pending your review</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8', marginBottom: '20px' }}>
        {[
          { key: 'pending', label: `Pending (${pending.length})` },
          { key: 'reviewed', label: `Reviewed (${reviewed.length})` },
        ].map(t => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px', fontSize: '13px', cursor: 'pointer',
              fontWeight: tab === t.key ? 500 : 400,
              color: tab === t.key ? '#1A1A1A' : '#6B6B6B',
              borderBottom: tab === t.key ? '2px solid #8C3225' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ fontSize: '13px', color: '#6B6B6B' }}>Loading...</div>
      )}

      {!loading && displayList.length === 0 && (
        <div style={{ fontSize: '14px', color: '#4A4A4A', textAlign: 'center', padding: '40px 0' }}>
          No reports pending your review
        </div>
      )}

      {!loading && displayList.map(report => (
        <ReportCard
          key={report.id}
          report={report}
          onClick={onViewReport}
          showSLA={tab === 'pending'}
        />
      ))}
    </div>
  )
}
