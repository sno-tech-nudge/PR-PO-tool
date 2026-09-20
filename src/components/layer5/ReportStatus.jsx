import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/approvalEngine'
import NotificationToast from './NotificationToast'
import ReportChat from '../shared/ReportChat'
import Confetti from '../shared/Confetti'
import ExpenseDetailModal from '../layer2/ExpenseDetailModal'

const STATUS_BADGE = {
  draft: { bg: 'var(--taupe-100)', color: 'var(--text-muted)', label: 'Draft', icon: '●' },
  submitted: { bg: 'var(--taupe-50)', color: 'var(--text)', label: 'Submitted', icon: '◷' },
  under_review: { bg: 'var(--action-bg)', color: 'var(--action)', label: 'Under Review', icon: '◷' },
  approved: { bg: 'var(--moss-bg)', color: 'var(--moss)', label: 'Approved', icon: '✓' },
  rejected: { bg: 'var(--clay-bg)', color: 'var(--clay-text)', label: 'Rejected', icon: '✕' },
  processing: { bg: 'var(--gold-bg)', color: 'var(--gold-text)', label: 'Processing', icon: '◷' },
  reimbursed: { bg: 'var(--moss-bg)', color: 'var(--moss)', label: 'Reimbursed', icon: '✓' },
}

function ActivityItem({ text, timestamp }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: 'var(--taupe-200)', flexShrink: 0, marginTop: '5px',
      }} />
      <div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{text}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{timestamp}</div>
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
  const [celebrate, setCelebrate] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const subRef = useRef(null)
  const celebratedRef = useRef(false)

  function showToast(message, type = 'info') {
    setToast({ message, type })
  }

  // Fires once per report, the first time this person sees it as
  // Reimbursed — a plain localStorage flag (not a DB column) since it's
  // purely a "have I already celebrated this on this device" marker, not
  // data anything else needs to read.
  function celebrateOnce(id) {
    if (!id || celebratedRef.current) return
    const key = `celebrated_report_${id}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch { /* private-browsing or storage disabled — still celebrate this once */ }
    celebratedRef.current = true
    setCelebrate(true)
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
      if (rep?.status === 'reimbursed') celebrateOnce(rep.id)
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
          if (payload.new.status === 'reimbursed') celebrateOnce(payload.new.id || reportId)
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
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          This report could not be found.
        </div>
        <button
          onClick={onBack}
          style={{
            width: '100%', height: '48px', background: 'var(--action)', color: 'var(--surface-card)',
            border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          }}
        >
          Go home
        </button>
      </div>
    )
  }

  const status = report?.status || 'submitted'
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
      {celebrate && <Confetti />}
      {toast && (
        <NotificationToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Report Status</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {report?.report_reference || '—'} · {report?.created_at ? new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
        </div>
      </div>

      {linkedPO && (
        <div style={{ border: '1px solid var(--taupe-200)', marginBottom: '16px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Purchase Order</div>
            <div style={{ fontSize: '13px', color: 'var(--text)' }}>{linkedPO.po_number}</div>
          </div>
          {onViewPO && (
            <div
              onClick={() => onViewPO(linkedPO.id)}
              style={{ fontSize: '13px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              View PO
            </div>
          )}
        </div>
      )}

      {(report?.business_purpose || report?.duration_start || report?.duration_end) && (
        <div style={{ border: '1px solid var(--taupe-200)', marginBottom: '16px', overflow: 'hidden' }}>
          {report?.business_purpose && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: report?.duration_start || report?.duration_end ? '1px solid var(--taupe-200)' : 'none' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Business Purpose</span>
              <span style={{ fontSize: '13px', color: 'var(--text)', textAlign: 'right', maxWidth: '65%' }}>{report.business_purpose}</span>
            </div>
          )}
          {(report?.duration_start || report?.duration_end) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--taupe-50)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Duration</span>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                {[report.duration_start, report.duration_end].filter(Boolean).map(d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })).join(' – ')}
              </span>
            </div>
          )}
        </div>
      )}

      {polling && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Live updates paused. Refreshing every 30 seconds.
        </div>
      )}

      {status === 'reimbursed' && (
        <div style={{
          border: '1px solid var(--moss-border)', background: 'var(--moss-bg)', borderRadius: 'var(--radius-md)',
          padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--moss-text)',
        }}>
          🎉 ₹{Number(report?.total_amount || 0).toLocaleString('en-IN')} reimbursed — this report is fully settled.
        </div>
      )}

      {/* Rejection card */}
      {isRejected && report?.rejection_reason && (
        <div style={{
          border: '1px solid var(--clay-text)', padding: '16px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--clay-text)', marginBottom: '8px' }}>
            Returned for revision
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '8px', lineHeight: '1.5' }}>
            {report.rejection_reason}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Returned by {report.reviewed_by || 'approver'}{report.rejected_at ? ` on ${new Date(report.rejected_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </div>
        </div>
      )}

      {isRejected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          <button
            onClick={onStartNew}
            style={{
              width: '100%', height: '48px', background: 'var(--action)', color: 'var(--surface-card)',
              border: 'none', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Edit and resubmit
          </button>
          <button
            style={{
              width: '100%', height: '48px', background: 'var(--surface-card)', color: 'var(--text)',
              border: '1px solid var(--action)', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Download original report
          </button>
        </div>
      )}

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
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
              Expenses in this report
            </div>
            {expenses.length > 3 && (
              <div
                onClick={() => setShowAll(s => !s)}
                style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {showAll ? 'Show less' : 'Show all'}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--taupe-200)', overflow: 'hidden' }}>
            {displayedExpenses.map((exp, i) => (
              <div
                key={exp.id}
                onClick={() => setSelectedExpense(exp)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: i < displayedExpenses.length - 1 ? '1px solid var(--taupe-200)' : 'none',
                  background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                    {exp.vendor || 'Unknown vendor'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                    {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {[exp.category, exp.date].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{
                    fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-xs)',
                    background: exp.policy_status === 'blocked' ? 'var(--clay-bg)' : exp.policy_status === 'flagged' ? 'var(--gold-bg)' : 'var(--moss-bg)',
                    color: exp.policy_status === 'blocked' ? 'var(--clay-text)' : exp.policy_status === 'flagged' ? 'var(--gold-text)' : 'var(--moss)',
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
          border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-lg)',
          padding: '12px 16px', marginBottom: '16px',
          background: 'var(--moss-bg)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--moss-text)' }}>
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
          border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)',
          padding: '12px 16px', marginBottom: '16px',
          background: 'var(--taupe-50)',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Finance Note
          </div>
          <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>
            {report.finance_notes}
          </div>
        </div>
      )}

      {/* Chat thread with finance */}
      {reportId && (
        <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: '16px' }}>
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
          background: 'var(--surface-card)', color: 'var(--text)',
          border: '1px solid var(--taupe-200)', fontSize: '14px', fontWeight: 500,
          cursor: 'pointer', borderRadius: 'var(--radius-sm)',
        }}
      >
        Go home
      </button>

      {selectedExpense && (
        <ExpenseDetailModal expense={selectedExpense} onClose={() => setSelectedExpense(null)} />
      )}
    </div>
  )
}
