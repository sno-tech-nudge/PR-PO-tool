import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUS_STEP, formatDateTime } from '../../lib/approvalEngine'
import StatusTimeline from './StatusTimeline'
import NotificationToast from './NotificationToast'
import ReportChat from '../shared/ReportChat'

const STATUS_BADGE = {
  draft: { bg: '#F3F4F6', color: '#6B7280', label: 'Draft' },
  submitted: { bg: '#F7F7F7', color: '#1A1A1A', label: 'Submitted' },
  under_review: { bg: '#fdf0ed', color: '#8C3225', label: 'Under Review' },
  approved: { bg: '#F0FDF4', color: '#16A34A', label: 'Approved' },
  rejected: { bg: '#FEF2F2', color: '#DC2626', label: 'Rejected' },
  processing: { bg: '#FEFCE8', color: '#CA8A04', label: 'Processing' },
  reimbursed: { bg: '#F0FDF4', color: '#16A34A', label: 'Reimbursed' },
}

function getStatusMessage(status, reviewedBy) {
  const approver = reviewedBy || 'your approver'
  switch (status) {
    case 'draft': return 'This report has not been submitted yet'
    case 'submitted': return `Waiting for ${approver} to review`
    case 'under_review': return `${approver} is reviewing your report`
    case 'approved': return `Approved by ${approver}. Finance is processing.`
    case 'rejected': return `Returned by ${approver}. See reason below.`
    case 'processing': return 'Finance is processing your reimbursement'
    case 'reimbursed': return 'Reimbursement has been processed'
    default: return ''
  }
}

function ActivityItem({ text, timestamp }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: '#E8E8E8', flexShrink: 0, marginTop: '5px',
      }} />
      <div>
        <div style={{ fontSize: '12px', color: '#4A4A4A' }}>{text}</div>
        <div style={{ fontSize: '11px', color: '#6B6B6B', marginTop: '2px' }}>{timestamp}</div>
      </div>
    </div>
  )
}

export default function ReportStatus({ reportId, onBack, onStartNew, onViewPO }) {
  const [report, setReport] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [approvals, setApprovals] = useState([])
  const [linkedPO, setLinkedPO] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [polling, setPolling] = useState(false)
  const [, setRealtimeConnected] = useState(false)
  const [toast, setToast] = useState(null)
  const subRef = useRef(null)

  function showToast(message, type = 'info') {
    setToast({ message, type })
  }

  // Load report and expenses
  useEffect(() => {
    if (!reportId) return

    async function load() {
      const { data: rep } = await supabase
        .from('expense_reports')
        .select('*')
        .eq('id', reportId)
        .single()

      if (rep) setReport(rep)
      if (rep?.po_id) {
        const { data: po } = await supabase.from('purchase_orders').select('id, po_number, status').eq('id', rep.po_id).single()
        setLinkedPO(po)
      }

      const { data: re } = await supabase
        .from('report_expenses')
        .select('expense_details(*)')
        .eq('report_id', reportId)
      setExpenses(re?.map(r => r.expense_details).filter(Boolean) || [])

      const { data: appr } = await supabase
        .from('report_approvals')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true })
      setApprovals(appr || [])
    }

    load()
  }, [reportId])

  // Realtime subscription
  useEffect(() => {
    if (!reportId) return

    const sub = supabase
      .channel(`report-status-${reportId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'expense_reports', filter: `id=eq.${reportId}` },
        (payload) => {
          setReport(prev => ({ ...prev, ...payload.new }))
          const badge = STATUS_BADGE[payload.new.status]
          if (badge) showToast(`Report status updated: ${badge.label}`, payload.new.status === 'rejected' ? 'rejected' : payload.new.status === 'approved' || payload.new.status === 'reimbursed' ? 'approved' : 'info')
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeConnected(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeConnected(false)
          setPolling(true)
        }
      })

    subRef.current = sub
    return () => { supabase.removeChannel(sub) }
  }, [reportId])

  // Polling fallback
  useEffect(() => {
    if (!polling || !reportId) return
    const interval = setInterval(async () => {
      const { data } = await supabase.from('expense_reports').select('*').eq('id', reportId).single()
      if (data) setReport(data)
    }, 30000)
    return () => clearInterval(interval)
  }, [polling, reportId])

  if (!report && !reportId) {
    return (
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: '#4A4A4A', marginBottom: '16px' }}>
          This report could not be found.
        </div>
        <button
          onClick={onBack}
          style={{
            width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
          }}
        >
          Go home
        </button>
      </div>
    )
  }

  const status = report?.status || 'submitted'
  const currentStep = STATUS_STEP[status] ?? 0
  const badge = STATUS_BADGE[status] || STATUS_BADGE.submitted
  const isRejected = status === 'rejected'

  // Activity log from report + approval records
  const activities = []
  if (report?.created_at) activities.push({ text: 'Report submitted', timestamp: formatDateTime(report.created_at) })
  approvals.forEach(a => {
    activities.push({ text: `${a.approver_name} notified`, timestamp: formatDateTime(a.created_at) })
    if (a.actioned_at && a.status === 'approved') activities.push({ text: `Approved by ${a.approver_name}`, timestamp: formatDateTime(a.actioned_at) })
    if (a.actioned_at && a.status === 'rejected') activities.push({ text: `Returned by ${a.approver_name}`, timestamp: formatDateTime(a.actioned_at) })
  })
  if (report?.approved_at && !approvals.some(a => a.status === 'approved')) {
    activities.push({ text: 'Approved — sent to Finance', timestamp: formatDateTime(report.approved_at) })
  }

  const displayedExpenses = showAll ? expenses : expenses.slice(0, 3)

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      {toast && (
        <NotificationToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Report Status</div>
        <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
          {report?.report_reference || '—'} · {report?.created_at ? new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
        </div>
      </div>

      {linkedPO && (
        <div style={{ border: '1px solid #E8E8E8', marginBottom: '16px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '2px' }}>Purchase Order</div>
            <div style={{ fontSize: '13px', color: '#1A1A1A' }}>{linkedPO.po_number}</div>
          </div>
          {onViewPO && (
            <div
              onClick={() => onViewPO(linkedPO.id)}
              style={{ fontSize: '13px', color: '#8C3225', cursor: 'pointer', textDecoration: 'underline' }}
            >
              View PO
            </div>
          )}
        </div>
      )}

      {(report?.business_purpose || report?.duration_start || report?.duration_end) && (
        <div style={{ border: '1px solid #E8E8E8', marginBottom: '16px', overflow: 'hidden' }}>
          {report?.business_purpose && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: report?.duration_start || report?.duration_end ? '1px solid #E8E8E8' : 'none' }}>
              <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Business Purpose</span>
              <span style={{ fontSize: '13px', color: '#1A1A1A', textAlign: 'right', maxWidth: '65%' }}>{report.business_purpose}</span>
            </div>
          )}
          {(report?.duration_start || report?.duration_end) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#F7F7F7' }}>
              <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Duration</span>
              <span style={{ fontSize: '13px', color: '#1A1A1A' }}>
                {[report.duration_start, report.duration_end].filter(Boolean).map(d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })).join(' – ')}
              </span>
            </div>
          )}
        </div>
      )}

      {polling && (
        <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '8px' }}>
          Live updates paused. Refreshing every 30 seconds.
        </div>
      )}

      {/* Status badge */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          display: 'inline-block',
          background: badge.bg, color: badge.color,
          padding: '6px 16px', fontSize: '13px', fontWeight: 500,
          borderRadius: '2px', marginBottom: '8px',
        }}>
          {badge.label}
        </div>
        <div style={{ fontSize: '13px', color: '#4A4A4A', lineHeight: '1.5' }}>
          {getStatusMessage(status, report?.reviewed_by)}
        </div>
      </div>

      {/* Rejection card */}
      {isRejected && report?.rejection_reason && (
        <div style={{
          border: '1px solid #DC2626', padding: '16px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#DC2626', marginBottom: '8px' }}>
            Returned for revision
          </div>
          <div style={{ fontSize: '13px', color: '#1A1A1A', marginBottom: '8px', lineHeight: '1.5' }}>
            {report.rejection_reason}
          </div>
          <div style={{ fontSize: '11px', color: '#6B6B6B' }}>
            Returned by {report.reviewed_by || 'approver'}{report.rejected_at ? ` on ${new Date(report.rejected_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </div>
        </div>
      )}

      {isRejected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          <button
            onClick={onStartNew}
            style={{
              width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
              border: 'none', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Edit and resubmit
          </button>
          <button
            style={{
              width: '100%', height: '48px', background: '#FFFFFF', color: '#1A1A1A',
              border: '1px solid #8C3225', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Download original report
          </button>
        </div>
      )}

      {/* Timeline */}
      <div style={{ border: '1px solid #E8E8E8', padding: '16px', marginBottom: '20px' }}>
        <StatusTimeline currentStep={currentStep} />
      </div>

      {/* Activity log */}
      {activities.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          {[...activities].reverse().map((a, i) => (
            <ActivityItem key={i} text={a.text} timestamp={a.timestamp} />
          ))}
        </div>
      )}

      {/* Expenses */}
      {expenses.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A' }}>
              Expenses in this report
            </div>
            {expenses.length > 3 && (
              <div
                onClick={() => setShowAll(s => !s)}
                style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {showAll ? 'Show less' : 'Show all'}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid #E8E8E8', overflow: 'hidden' }}>
            {displayedExpenses.map((exp, i) => (
              <div
                key={exp.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: i < displayedExpenses.length - 1 ? '1px solid #E8E8E8' : 'none',
                  background: i % 2 === 0 ? '#FFFFFF' : '#F7F7F7',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
                    {exp.vendor || 'Unknown vendor'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
                    {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
                    {[exp.category, exp.date].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{
                    fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '2px',
                    background: exp.policy_status === 'blocked' ? '#FEF2F2' : exp.policy_status === 'flagged' ? '#FEFCE8' : '#F0FDF4',
                    color: exp.policy_status === 'blocked' ? '#DC2626' : exp.policy_status === 'flagged' ? '#CA8A04' : '#16A34A',
                  }}>
                    {exp.policy_status === 'blocked' ? 'Issue' : exp.policy_status === 'flagged' ? 'Flagged' : 'Passed'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vouched indicator */}
      {report?.vouched_at && (
        <div style={{
          border: '1px solid #BBF7D0', borderRadius: '8px',
          padding: '12px 16px', marginBottom: '16px',
          background: '#F0FDF4',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803D' }}>
              Verified by Finance
            </div>
            <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>
              {report.vouched_by || 'Finance Team'} · {new Date(report.vouched_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {/* Finance notes visible to employee */}
      {report?.finance_notes && (
        <div style={{
          border: '1px solid #E5E7EB', borderRadius: '8px',
          padding: '12px 16px', marginBottom: '16px',
          background: '#F9FAFB',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Finance Note
          </div>
          <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>
            {report.finance_notes}
          </div>
        </div>
      )}

      {/* Chat thread with finance */}
      {reportId && (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <ReportChat
            reportId={reportId}
            currentRole="employee"
            currentName="Employee"
          />
        </div>
      )}

      {/* Back / home */}
      <button
        onClick={onBack}
        style={{
          width: '100%', height: '48px',
          background: '#FFFFFF', color: '#1A1A1A',
          border: '1px solid #E8E8E8', fontSize: '14px', fontWeight: 500,
          cursor: 'pointer', borderRadius: '4px',
        }}
      >
        Go home
      </button>
    </div>
  )
}
