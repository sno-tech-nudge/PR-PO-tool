import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { processApproval, createNotification } from '../../lib/approvalEngine'
import { generateManagerSummary } from '../../lib/claude'
import ExpenseApprovalCard from './ExpenseApprovalCard'
import RejectionModal from './RejectionModal'
import NotificationToast from './NotificationToast'

const ROUTE_LABEL = {
  reporting_manager: 'Reporting Manager',
  manager_and_fl: 'Reporting Manager and Functional Lead',
  manager_fl_coo: 'Reporting Manager, Functional Lead and COO',
}

function SummaryRow({ label, value, alt }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 16px', minHeight: '40px',
      background: alt ? '#F7F7F7' : '#FFFFFF',
      borderBottom: '1px solid #E8E8E8',
    }}>
      <div style={{ fontSize: '12px', color: '#6B6B6B' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1A1A1A', textAlign: 'right', maxWidth: '55%' }}>{value || '—'}</div>
    </div>
  )
}

export default function ApproverReportView({ reportId, onBack, showToast }) {
  const [report, setReport] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [pendingApproval, setPendingApproval] = useState(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [approveStatus, setApproveStatus] = useState(null) // 'confirming' | 'done' | 'error'
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [flagNotes, setFlagNotes] = useState({}) // expenseId -> note
  const [toast, setToast] = useState(null)
  const [aiSummary, setAiSummary] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (!reportId) return

    async function load() {
      const { data: rep } = await supabase
        .from('expense_reports')
        .select('*')
        .eq('id', reportId)
        .single()
      setReport(rep)

      const { data: re } = await supabase
        .from('report_expenses')
        .select('expense_details(*)')
        .eq('report_id', reportId)
      setExpenses(re?.map(r => r.expense_details).filter(Boolean) || [])

      const { data: apprList } = await supabase
        .from('report_approvals')
        .select('*')
        .eq('report_id', reportId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
      setPendingApproval(apprList?.[0] || null)
      setLoading(false)

      // Auto-generate AI summary for manager
      const loadedExpenses = re?.map(r => r.expense_details).filter(Boolean) || []
      if (rep && loadedExpenses.length > 0) {
        setAiLoading(true)
        generateManagerSummary(rep, loadedExpenses).then(summary => {
          setAiSummary(summary)
          setAiLoading(false)
        })
      }
    }
    load()
  }, [reportId])

  async function handleApprove() {
    if (!pendingApproval) return
    setApproving(true)
    setApproveStatus('confirming')

    try {
      const combinedNotes = Object.entries(flagNotes)
        .map(([id, note]) => `[${id.slice(-6)}]: ${note}`)
        .join('; ')

      await processApproval(reportId, pendingApproval.approver_level, 'approved', combinedNotes || '', supabase)
      await createNotification(
        report?.employee_id || reportId,
        reportId,
        'approved',
        `Your report ${report?.report_reference} has been approved.`,
        supabase
      )
      setApproveStatus('done')
      if (showToast) showToast(`Report ${report?.report_reference} approved.`, 'approved')
      else setToast({ message: `Report ${report?.report_reference} approved.`, type: 'approved' })
      setTimeout(onBack, 1500)
    } catch {
      setApproveStatus('error')
      setApproving(false)
    }
  }

  async function handleReject(reason) {
    if (!pendingApproval) return
    try {
      await processApproval(reportId, pendingApproval.approver_level, 'rejected', reason, supabase)
      await createNotification(
        report?.employee_id || reportId,
        reportId,
        'rejected',
        `Your report ${report?.report_reference} has been returned for revision.`,
        supabase
      )
      if (showToast) showToast(`Report returned to employee.`, 'rejected')
      else setToast({ message: 'Report returned to employee.', type: 'rejected' })
      setShowRejectModal(false)
      setTimeout(onBack, 1500)
    } catch {
      // noop
    }
  }

  async function handleRemoveExpense(expenseId) {
    await supabase
      .from('report_expenses')
      .delete()
      .eq('report_id', reportId)
      .eq('expense_id', expenseId)
    setExpenses(prev => prev.filter(e => e.id !== expenseId))
  }

  function handleFlagExpense(expenseId, note) {
    setFlagNotes(prev => ({ ...prev, [expenseId]: note }))
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '13px', color: '#6B6B6B' }}>Loading report...</div>
      </div>
    )
  }

  if (!report) {
    return (
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: '#4A4A4A', marginBottom: '16px' }}>This report could not be found.</div>
        <button onClick={onBack} style={{ width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF', border: 'none', fontSize: '14px', cursor: 'pointer', borderRadius: '4px' }}>
          Go back
        </button>
      </div>
    )
  }

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const isAlreadyReviewed = report.status === 'approved' || report.status === 'rejected'

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%', paddingBottom: '140px' }}>
      {toast && (
        <NotificationToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      {/* Header */}
      <div onClick={onBack} style={{ fontSize: '13px', color: '#6B7280', cursor: 'pointer', marginBottom: '16px' }}>
        ← Approvals
      </div>
      <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Review Report</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
        ₹{Number(report.total_amount || 0).toLocaleString('en-IN')}
      </div>
      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '16px' }}>
        {report.brand || 'The Nudge Institute'} · <span style={{ fontFamily: 'monospace' }}>{report.report_reference}</span>
      </div>

      {/* AI Summary — auto-loads */}
      {(aiLoading || aiSummary) && (
        <div style={{
          border: '1px solid #E5E7EB',
          borderLeft: `3px solid ${aiSummary?.recommendation === 'approve' ? '#10B981' : '#F59E0B'}`,
          borderRadius: '8px', padding: '14px 16px', marginBottom: '16px',
          background: '#F9FAFB',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            AI Summary
          </div>

          {aiLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[100, 80, 60].map((w, i) => (
                <div key={i} style={{ height: '12px', background: '#E5E7EB', borderRadius: '4px', width: `${w}%` }} />
              ))}
            </div>
          )}

          {!aiLoading && aiSummary && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', marginBottom: '6px' }}>
                {aiSummary.headline}
              </div>
              <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px', lineHeight: 1.5 }}>
                {aiSummary.breakdown}
              </div>
              {aiSummary.flags && (
                <div style={{ fontSize: '12px', color: '#B45309', marginBottom: '8px' }}>
                  {aiSummary.flags}
                </div>
              )}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: aiSummary.recommendation === 'approve' ? '#F0FDF4' : '#FFFBEB',
                border: `1px solid ${aiSummary.recommendation === 'approve' ? '#BBF7D0' : '#FDE68A'}`,
                borderRadius: '4px', padding: '4px 10px',
              }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700,
                  color: aiSummary.recommendation === 'approve' ? '#15803D' : '#B45309',
                }}>
                  {aiSummary.recommendation === 'approve' ? 'Recommended for approval' : 'Suggest reviewing'}
                </span>
              </div>
              {aiSummary.recommendation_note && (
                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '6px' }}>
                  {aiSummary.recommendation_note}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Summary */}
      <div style={{ border: '1px solid #E8E8E8', overflow: 'hidden', marginBottom: '20px', borderRadius: '6px' }}>
        <SummaryRow label="Reference" value={<span style={{ fontFamily: 'monospace' }}>{report.report_reference}</span>} alt={false} />
        <SummaryRow label="Entity" value={report.brand || 'The Nudge Institute'} alt={true} />
        {(report.duration_start || report.duration_end) && (
          <SummaryRow
            label="Duration"
            value={[report.duration_start, report.duration_end].filter(Boolean).map(d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })).join(' – ')}
            alt={false}
          />
        )}
        {report.business_purpose && (
          <SummaryRow label="Business Purpose" value={report.business_purpose} alt={true} />
        )}
        <SummaryRow label="Expenses" value={`${expenses.length} item${expenses.length !== 1 ? 's' : ''}`} alt={false} />
        <SummaryRow label="Total amount" value={`₹${Number(report.total_amount || 0).toLocaleString('en-IN')}`} alt={true} />
        <SummaryRow label="Approval route" value={ROUTE_LABEL[report.approval_route] || '—'} alt={false} />
        <SummaryRow label="Status" value={report.status?.replace('_', ' ') || '—'} alt={true} />
      </div>

      {/* Expenses */}
      <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', marginBottom: '12px' }}>Expenses</div>
      {expenses.map(exp => (
        <ExpenseApprovalCard
          key={exp.id}
          expense={exp}
          onFlag={handleFlagExpense}
          onRemove={handleRemoveExpense}
        />
      ))}

      {/* Approve error */}
      {approveStatus === 'error' && (
        <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '12px', textAlign: 'center' }}>
          Action could not be saved. Please try again.
        </div>
      )}

      {/* Fixed decision bar */}
      {!isAlreadyReviewed && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
          <div style={{
            maxWidth: '480px', margin: '0 auto',
            background: '#FFFFFF', borderTop: '1px solid #E8E8E8', padding: '16px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', marginBottom: '10px' }}>
              {expenses.length} expense{expenses.length !== 1 ? 's' : ''} · ₹{Number(total).toLocaleString('en-IN')}
            </div>

            {approveStatus === 'confirming' && (
              <div style={{ fontSize: '12px', color: '#4A4A4A', marginBottom: '8px' }}>
                Confirming approval...
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handleApprove}
                disabled={approving || approveStatus === 'done'}
                style={{
                  width: '100%', height: '48px',
                  background: approving ? '#9CA3AF' : '#16A34A',
                  color: '#FFFFFF', border: 'none',
                  fontSize: '14px', fontWeight: 500,
                  cursor: approving ? 'default' : 'pointer', borderRadius: '4px',
                }}
              >
                {approveStatus === 'done' ? 'Approved' : approving ? 'Approving…' : 'Approve report'}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={approving}
                style={{
                  width: '100%', height: '48px',
                  background: '#FFFFFF',
                  color: approving ? '#E8E8E8' : '#DC2626',
                  border: `1px solid ${approving ? '#E8E8E8' : '#DC2626'}`,
                  fontSize: '14px', fontWeight: 500,
                  cursor: approving ? 'default' : 'pointer', borderRadius: '4px',
                }}
              >
                Return to employee
              </button>
            </div>
          </div>
        </div>
      )}

      {isAlreadyReviewed && (
        <div style={{
          padding: '12px 16px',
          background: report.status === 'approved' ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${report.status === 'approved' ? '#16A34A' : '#DC2626'}`,
          fontSize: '13px',
          color: report.status === 'approved' ? '#16A34A' : '#DC2626',
        }}>
          This report has been {report.status}.
        </div>
      )}

      {showRejectModal && (
        <RejectionModal
          onSendBack={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}
    </div>
  )
}
