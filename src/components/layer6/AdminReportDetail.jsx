import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCSV, reportsToRows } from '../../lib/exportUtils'
import { runAIVouchCheck } from '../../lib/claude'
import ReportChat from '../shared/ReportChat'
import { manualLinkPRToExpense } from '../../lib/linkEngine'

const STATUS_CONFIG = {
  submitted:    { label: 'Submitted',     color: '#B45309', bg: '#FFFBEB' },
  under_review: { label: 'Under Review',  color: '#8C3225', bg: '#fdf0ed' },
  approved:     { label: 'Approved',      color: '#15803D', bg: '#F0FDF4' },
  processing:   { label: 'Processing',    color: '#6D28D9', bg: '#F5F3FF' },
  reimbursed:   { label: 'Reimbursed',    color: '#374151', bg: '#F9FAFB' },
  rejected:     { label: 'Rejected',      color: '#B91C1C', bg: '#FEF2F2' },
}

const POLICY_CONFIG = {
  passed:    { label: 'Passed',    color: '#15803D', bg: '#F0FDF4' },
  flagged:   { label: 'Flagged',   color: '#B45309', bg: '#FFFBEB' },
  violation: { label: 'Violation', color: '#B91C1C', bg: '#FEF2F2' },
}

const AI_VERDICT_CONFIG = {
  pass: { color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0', icon: 'P' },
  warn: { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', icon: 'W' },
  flag: { color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', icon: 'F' },
}

const OVERALL_CONFIG = {
  approve: { label: 'Recommend Approval',    color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
  query:   { label: 'Query Before Approving', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  flag:    { label: 'Flag — Do Not Approve', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
}

function fmtDate(d) {
  if (!d) return '—'
  const ddmm = String(d).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  const dt = ddmm ? new Date(`${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`) : new Date(d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminReportDetail({ reportId, onBack }) {
  const [report, setReport]         = useState(null)
  const [approvals, setApprovals]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [financeNotes, setFinanceNotes] = useState('')
  const [vouching, setVouching]     = useState(false)
  const [vouchError, setVouchError] = useState(null)
  const [savedMsg, setSavedMsg]     = useState(null)
  const [exporting, setExporting]   = useState(false)
  const [aiResult, setAiResult]     = useState(null)
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiError, setAiError]       = useState(null)
  const [pdfUrl, setPdfUrl]         = useState(null)

  useEffect(() => { load() }, [reportId])

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: approv }] = await Promise.all([
      supabase
        .from('expense_reports')
        .select(`
          id, report_reference, status, brand, total_amount, expense_count,
          approval_route, created_at, approved_at, rejected_at, reimbursed_at,
          rejection_reason, vouched_at, vouched_by, finance_notes, pdf_storage_path,
          report_expenses (
            expense_details (
              id, vendor, category, amount, date, payment_method,
              invoice_number, gstin, description, policy_status,
              expense_type, reimbursement_type, submitted_at, capture_id
            )
          )
        `)
        .eq('id', reportId)
        .single(),
      supabase
        .from('report_approvals')
        .select('approver_level, status, action, notes, acted_at, due_at')
        .eq('report_id', reportId)
        .order('approver_level'),
    ])

    setReport(r)
    setFinanceNotes(r?.finance_notes || '')
    setApprovals(approv || [])
    setLoading(false)

    if (r?.pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from('expense-reports')
        .createSignedUrl(r.pdf_storage_path, 3600)
      if (signed?.signedUrl) setPdfUrl(signed.signedUrl)
    }

    const expenses = (r?.report_expenses || []).map(re => re.expense_details).filter(Boolean)
    if (r && expenses.length > 0) autoRunAI(r, expenses)
  }

  async function autoRunAI(reportData, expenses) {
    setAiLoading(true)
    setAiError(null)
    const result = await runAIVouchCheck(reportData, expenses)
    if (result) {
      setAiResult(result)
      if (!reportData.finance_notes && result.audit_notes) setFinanceNotes(result.audit_notes)
    } else {
      setAiError('AI check failed — run manually if needed.')
    }
    setAiLoading(false)
  }

  async function handleVouch() {
    setVouching(true)
    setVouchError(null)
    const { error } = await supabase
      .from('expense_reports')
      .update({ vouched_at: new Date().toISOString(), vouched_by: 'Finance Team', finance_notes: financeNotes || null })
      .eq('id', reportId)
    if (error) { setVouchError('Failed to save. Please try again.'); setVouching(false); return }
    setReport(prev => ({ ...prev, vouched_at: new Date().toISOString(), vouched_by: 'Finance Team', finance_notes: financeNotes }))
    setSavedMsg('Report marked as vouched')
    setVouching(false)
    setTimeout(() => setSavedMsg(null), 3000)
  }

  async function handleSaveNotes() {
    setVouching(true)
    setVouchError(null)
    const { error } = await supabase.from('expense_reports').update({ finance_notes: financeNotes }).eq('id', reportId)
    if (error) { setVouchError('Failed to save notes.'); setVouching(false); return }
    setReport(prev => ({ ...prev, finance_notes: financeNotes }))
    setSavedMsg('Notes saved')
    setVouching(false)
    setTimeout(() => setSavedMsg(null), 3000)
  }

  function handleExport() {
    setExporting(true)
    downloadCSV(reportsToRows([report]), `${report.report_reference || 'report'}.csv`)
    setExporting(false)
  }

  async function handleAICheck() {
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    const exps = (report.report_expenses || []).map(re => re.expense_details).filter(Boolean)
    const result = await runAIVouchCheck(report, exps)
    if (!result) setAiError('AI check failed. Check your Groq API key or try again.')
    else setAiResult(result)
    setAiLoading(false)
  }

  if (loading) {
    return (
      <div>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: '52px', background: '#E5E7EB', borderRadius: '3px', marginBottom: '10px' }} />
        ))}
      </div>
    )
  }

  if (!report) return <div style={{ fontSize: '13px', color: '#6B7280', padding: '24px 0' }}>Report not found.</div>

  const expenses  = (report.report_expenses || []).map(re => re.expense_details).filter(Boolean)
  const sc        = STATUS_CONFIG[report.status] || { label: report.status, color: '#6B7280', bg: '#F9FAFB' }
  const violations = expenses.filter(e => e.policy_status === 'violation')
  const flagged    = expenses.filter(e => e.policy_status === 'flagged')
  const isVouched  = !!report.vouched_at
  const oc         = aiResult ? OVERALL_CONFIG[aiResult.overall?.verdict] : null

  return (
    <div style={{ paddingBottom: '40px' }}>

      {/* Breadcrumb + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            onClick={onBack}
            style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}
          >
            All Reports
          </span>
          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
          <span style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace' }}>{report.report_reference}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ height: '30px', padding: '0 12px', background: '#FFFFFF', color: '#374151', border: '1px solid #E3E8EF', fontSize: '12px', cursor: 'pointer', borderRadius: '3px' }}
          >
            Export CSV
          </button>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              style={{ height: '30px', padding: '0 12px', background: '#FFFFFF', color: '#8C3225', border: '1px solid #E3E8EF', fontSize: '12px', cursor: 'pointer', borderRadius: '3px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              View PDF
            </a>
          )}
        </div>
      </div>

      {/* Report header card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E3E8EF', background: '#F8F9FA', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginBottom: '4px' }}>{report.report_reference}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#1A1F36', letterSpacing: '-0.5px' }}>
              INR {Number(report.total_amount || 0).toLocaleString('en-IN')}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
            {isVouched && (
              <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '2px', background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                Vouched
              </span>
            )}
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '2px', background: sc.bg, color: sc.color }}>
              {sc.label}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0', padding: '0' }}>
          {[
            { label: 'Entity',          value: report.brand },
            { label: 'Expenses',        value: report.expense_count || expenses.length },
            { label: 'Approval Route',  value: (report.approval_route || '').replace(/_/g, ' ') },
            { label: 'Submitted',       value: fmtDate(report.created_at) },
            report.approved_at   ? { label: 'Approved',   value: fmtDate(report.approved_at) }   : null,
            report.reimbursed_at ? { label: 'Reimbursed', value: fmtDate(report.reimbursed_at) } : null,
            report.rejected_at   ? { label: 'Rejected',   value: fmtDate(report.rejected_at) }   : null,
            isVouched ? { label: 'Vouched', value: `${fmtDate(report.vouched_at)}${report.vouched_by ? ' · ' + report.vouched_by : ''}` } : null,
          ].filter(Boolean).map((f, i) => (
            <div key={i} style={{ padding: '12px 20px', borderRight: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{f.label}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1A1F36' }}>{f.value || '—'}</div>
            </div>
          ))}
        </div>

        {report.rejection_reason && (
          <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: '#FEF2F2', borderRadius: '2px', borderLeft: '3px solid #EF4444' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rejection Reason</div>
            <div style={{ fontSize: '12px', color: '#B91C1C' }}>{report.rejection_reason}</div>
          </div>
        )}
      </div>

      {/* Policy alerts */}
      {(violations.length > 0 || flagged.length > 0) && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {violations.length > 0 && (
            <div style={{ flex: 1, minWidth: '200px', background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '3px solid #EF4444', borderRadius: '2px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#B91C1C' }}>
                {violations.length} Policy Violation{violations.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: '11px', color: '#7F1D1D', marginTop: '2px' }}>
                {violations.map(e => e.vendor || 'Unknown').join(' · ')}
              </div>
            </div>
          )}
          {flagged.length > 0 && (
            <div style={{ flex: 1, minWidth: '200px', background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #F59E0B', borderRadius: '2px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400E' }}>
                {flagged.length} Flagged Expense{flagged.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: '11px', color: '#78350F', marginTop: '2px' }}>
                {flagged.map(e => e.vendor || 'Unknown').join(' · ')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expenses table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E3E8EF', background: '#F8F9FA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Expenses ({expenses.length})
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#1A1F36', fontFamily: 'monospace' }}>
            INR {Number(report.total_amount || 0).toLocaleString('en-IN')}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
              {['Vendor', 'Category', 'Date', 'Invoice', 'GSTIN', 'AI Check', 'Policy', 'Amount (INR)'].map(h => (
                <th key={h} style={{ padding: '8px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: h === 'Amount (INR)' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp, i) => {
              const aiV = aiResult?.expenses?.find(e => e.index === i)
              const av  = aiV ? AI_VERDICT_CONFIG[aiV.verdict] : null
              const pc  = POLICY_CONFIG[exp.policy_status]
              return (
                <ExpenseTableRow key={exp.id || i} exp={exp} av={av} aiV={aiV} pc={pc} i={i} total={expenses.length} />
              )
            })}
          </tbody>
        </table>
      </div>

      {/* AI Vouch Check */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
        <div style={{
          padding: '12px 20px', borderBottom: (aiResult || aiLoading) ? '1px solid #E3E8EF' : 'none',
          background: oc ? oc.bg : '#F8F9FA',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>AI Vouch Check</span>
            {aiResult && (
              <span style={{ fontSize: '11px', color: '#6B7280' }}>
                {aiResult.overall?.confidence === 'high' ? 'High confidence' : aiResult.overall?.confidence === 'medium' ? 'Medium confidence' : 'Low confidence'}
              </span>
            )}
          </div>
          <button
            onClick={handleAICheck}
            disabled={aiLoading}
            style={{ height: '28px', padding: '0 12px', background: aiLoading ? '#F3F4F6' : '#1565C0', color: aiLoading ? '#9CA3AF' : '#FFFFFF', border: 'none', fontSize: '11px', fontWeight: 600, cursor: aiLoading ? 'default' : 'pointer', borderRadius: '3px' }}
          >
            {aiLoading ? 'Analysing…' : aiResult ? 'Re-run' : 'Run Check'}
          </button>
        </div>

        {aiLoading && (
          <div style={{ padding: '16px 20px' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: '12px', background: '#F3F4F6', borderRadius: '2px', marginBottom: '8px', width: i === 3 ? '60%' : '100%' }} />
            ))}
          </div>
        )}

        {!aiLoading && aiError && (
          <div style={{ padding: '12px 20px', fontSize: '12px', color: '#B91C1C' }}>{aiError}</div>
        )}

        {!aiLoading && aiResult && oc && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ background: oc.bg, border: `1px solid ${oc.border}`, borderRadius: '2px', padding: '10px 14px', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: oc.color, marginBottom: '4px' }}>{oc.label}</div>
              {aiResult.overall?.summary && (
                <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.5 }}>{aiResult.overall.summary}</div>
              )}
            </div>
            {aiResult.audit_notes && (
              <button
                onClick={() => setFinanceNotes(aiResult.audit_notes)}
                style={{ width: '100%', height: '32px', background: '#FFFFFF', color: '#374151', border: '1px dashed #D1D5DB', borderRadius: '2px', fontSize: '12px', cursor: 'pointer' }}
              >
                Fill audit notes with AI draft
              </button>
            )}
          </div>
        )}

        {!aiLoading && !aiResult && !aiError && (
          <div style={{ padding: '12px 20px', fontSize: '12px', color: '#9CA3AF' }}>
            Run an AI check to get per-expense verdicts, policy analysis, and a pre-drafted audit note.
          </div>
        )}
      </div>

      {/* Approval trail */}
      {approvals.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E3E8EF', background: '#F8F9FA' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Approval Trail</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
                {['Level', 'Status', 'Notes', 'Date'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {approvals.map((a, i) => {
                const isPending  = !a.acted_at
                const isApproved = a.action === 'approved'
                const isRejected = a.action === 'rejected' || a.action === 'returned'
                const statusColor = isPending ? '#6B7280' : isApproved ? '#15803D' : isRejected ? '#B91C1C' : '#374151'
                return (
                  <tr key={i} style={{ borderBottom: i < approvals.length - 1 ? '1px solid #F3F4F6' : 'none', background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#374151', fontWeight: 600 }}>Level {a.approver_level}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: statusColor }}>
                        {a.action ? a.action.charAt(0).toUpperCase() + a.action.slice(1) : 'Pending'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#6B7280' }}>{a.notes || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#9CA3AF' }}>
                      {a.acted_at ? fmtDate(a.acted_at) : 'Pending'}
                      {a.due_at && isPending && (
                        <div style={{ fontSize: '11px', color: new Date(a.due_at) < new Date() ? '#B91C1C' : '#B45309' }}>
                          Due {fmtDate(a.due_at)}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Finance Review */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E3E8EF', background: '#F8F9FA' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Finance Review</span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Audit Notes / Queries</div>
          <textarea
            value={financeNotes}
            onChange={e => setFinanceNotes(e.target.value)}
            placeholder="Add vouching notes, queries, or audit remarks…"
            rows={4}
            style={{
              width: '100%', border: '1px solid #E3E8EF', borderRadius: '3px',
              padding: '10px 12px', fontSize: '13px', color: '#1A1F36',
              outline: 'none', resize: 'vertical', marginBottom: '12px',
              boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
              background: '#FAFAFA',
            }}
          />

          {savedMsg && <div style={{ fontSize: '12px', color: '#15803D', marginBottom: '8px', fontWeight: 600 }}>{savedMsg}</div>}
          {vouchError && <div style={{ fontSize: '12px', color: '#B91C1C', marginBottom: '8px' }}>{vouchError}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            {!isVouched ? (
              <button
                onClick={handleVouch}
                disabled={vouching}
                style={{ height: '34px', padding: '0 20px', background: vouching ? '#9CA3AF' : '#1565C0', color: '#FFFFFF', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600, cursor: vouching ? 'default' : 'pointer' }}
              >
                {vouching ? 'Saving…' : 'Mark as Vouched'}
              </button>
            ) : (
              <button
                onClick={handleSaveNotes}
                disabled={vouching}
                style={{ height: '34px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '13px', cursor: vouching ? 'default' : 'pointer' }}
              >
                {vouching ? 'Saving…' : 'Update Notes'}
              </button>
            )}
          </div>

          {isVouched && (
            <div style={{ fontSize: '11px', color: '#15803D', marginTop: '8px', fontWeight: 500 }}>
              Vouched {fmtDate(report.vouched_at)}{report.vouched_by ? ` by ${report.vouched_by}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* PR Link */}
      <PRLinkSection reportId={reportId} report={report} onLinked={load} />

      {/* Comments */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E3E8EF', background: '#F8F9FA' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Comments</span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <ReportChat reportId={reportId} currentRole="finance" currentName="Finance Team" />
        </div>
      </div>

    </div>
  )
}

function ExpenseTableRow({ exp, av, aiV, pc, i, total }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{
          borderBottom: expanded || i < total - 1 ? '1px solid #F3F4F6' : 'none',
          background: av ? av.bg : i % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
          cursor: 'pointer',
        }}
      >
        <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 500, color: '#1A1F36' }}>
          {exp.vendor || 'Unknown vendor'}
        </td>
        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#374151' }}>{exp.category || '—'}</td>
        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(exp.date)}</td>
        <td style={{ padding: '10px 14px', fontSize: '11px', color: exp.invoice_number ? '#374151' : '#9CA3AF', fontFamily: 'monospace' }}>
          {exp.invoice_number || 'Missing'}
        </td>
        <td style={{ padding: '10px 14px', fontSize: '11px', color: exp.gstin ? '#374151' : '#9CA3AF', fontFamily: 'monospace' }}>
          {exp.gstin ? exp.gstin.substring(0, 8) + '…' : '—'}
        </td>
        <td style={{ padding: '10px 14px' }}>
          {av ? (
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: av.color }}>
                {aiV.verdict === 'pass' ? 'Pass' : aiV.verdict === 'warn' ? 'Warn' : 'Flag'}
              </span>
              {aiV.reason && (
                <div style={{ fontSize: '10px', color: av.color, marginTop: '1px' }}>{aiV.reason}</div>
              )}
            </div>
          ) : <span style={{ fontSize: '11px', color: '#9CA3AF' }}>—</span>}
        </td>
        <td style={{ padding: '10px 14px' }}>
          {pc ? (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '2px', background: pc.bg, color: pc.color }}>{pc.label}</span>
          ) : <span style={{ fontSize: '11px', color: '#9CA3AF' }}>—</span>}
        </td>
        <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: '#1A1F36', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {Number(exp.amount || 0).toLocaleString('en-IN')}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: i < total - 1 ? '1px solid #F3F4F6' : 'none' }}>
          <td colSpan={8} style={{ padding: '0 14px 12px', background: '#F8F9FA' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', paddingTop: '10px' }}>
              {exp.payment_method && <MiniField label="Payment" value={exp.payment_method} />}
              {exp.expense_type && <MiniField label="Type" value={exp.expense_type === 'just_me' ? 'Personal' : exp.expense_type === 'multiple_people' ? 'Team' : exp.expense_type} />}
              {exp.reimbursement_type && <MiniField label="Reimbursement" value={exp.reimbursement_type} />}
              {exp.gstin && <MiniField label="GSTIN" value={exp.gstin} mono />}
              {exp.invoice_number && <MiniField label="Invoice No." value={exp.invoice_number} mono />}
              {exp.description && <MiniField label="Note" value={exp.description} />}
            </div>
            {exp.capture_id && <ReceiptLink captureId={exp.capture_id} />}
            {!exp.capture_id && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#9CA3AF' }}>No receipt linked</div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function MiniField({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 500, color: '#374151', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
    </div>
  )
}

const LINK_CONF_COLORS = {
  high:   { label: 'High confidence',   color: '#15803D', bg: '#F0FDF4' },
  medium: { label: 'Medium confidence', color: '#B45309', bg: '#FFFBEB' },
  manual: { label: 'Manually linked',   color: '#8C3225', bg: '#fdf0ed' },
}

function PRLinkSection({ reportId, report, onLinked }) {
  const [linkedPR, setLinkedPR]   = useState(null)
  const [search, setSearch]       = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking]     = useState(false)
  const [error, setError]         = useState(null)
  const [success, setSuccess]     = useState(null)

  useEffect(() => {
    if (report?.pr_id) {
      supabase.from('purchase_requests').select('id, pr_number, amount, vendors(org_name), status').eq('id', report.pr_id).single()
        .then(({ data }) => setLinkedPR(data))
    }
  }, [report])

  async function handleSearch() {
    if (!search.trim()) return
    setSearching(true)
    const { data } = await supabase
      .from('purchase_requests')
      .select('id, pr_number, amount, vendors(org_name), status, requested_by')
      .or(`pr_number.ilike.%${search}%,vendors.org_name.ilike.%${search}%`)
      .in('status', ['approved', 'po_generated'])
      .is('linked_expense_report_id', null)
      .limit(5)
    setResults(data || [])
    setSearching(false)
  }

  async function handleLink(prId) {
    setLinking(true); setError(null)
    const result = await manualLinkPRToExpense(prId, reportId)
    if (result.error) { setError(result.error); setLinking(false); return }
    setSuccess('Linked successfully.')
    setResults([])
    setSearch('')
    onLinked()
    setLinking(false)
  }

  const lc = report?.link_confidence ? LINK_CONF_COLORS[report.link_confidence] : null

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #E3E8EF', background: '#F8F9FA' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Linked Purchase Request</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {linkedPR ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#8C3225', fontFamily: 'monospace' }}>{linkedPR.pr_number}</span>
              {lc && (
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '2px', background: lc.bg, color: lc.color }}>{lc.label}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#374151' }}>
              {linkedPR.vendors?.org_name} · INR {Number(linkedPR.amount || 0).toLocaleString('en-IN')} · {linkedPR.status}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '12px' }}>No purchase request linked. Search by PR number or vendor to link one manually.</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="PR number or vendor name…"
                style={{ flex: 1, height: '32px', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '0 10px', fontSize: '12px', outline: 'none', color: '#1A1F36' }}
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                style={{ height: '32px', padding: '0 14px', background: '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            {error && <div style={{ fontSize: '12px', color: '#B91C1C', marginBottom: '8px' }}>{error}</div>}
            {success && <div style={{ fontSize: '12px', color: '#15803D', marginBottom: '8px' }}>{success}</div>}
            {results.map(pr => (
              <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '6px', background: '#F8F9FA' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#8C3225', fontFamily: 'monospace' }}>{pr.pr_number}</span>
                  <span style={{ fontSize: '12px', color: '#374151', marginLeft: '10px' }}>{pr.vendors?.org_name} · INR {Number(pr.amount || 0).toLocaleString('en-IN')}</span>
                  <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginTop: '2px' }}>{pr.requested_by}</div>
                </div>
                <button
                  onClick={() => handleLink(pr.id)}
                  disabled={linking}
                  style={{ height: '28px', padding: '0 12px', background: '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '3px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Link
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ReceiptLink({ captureId }) {
  const [urls, setUrls]       = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (urls || loading) return
    setLoading(true)
    const { data } = await supabase.from('expense_captures').select('receipt_storage_path, payment_storage_path').eq('id', captureId).single()
    if (!data) { setLoading(false); return }
    const links = {}
    if (data.receipt_storage_path) {
      const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(data.receipt_storage_path, 3600)
      if (s?.signedUrl) links.receipt = s.signedUrl
    }
    if (data.payment_storage_path) {
      const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(data.payment_storage_path, 3600)
      if (s?.signedUrl) links.payment = s.signedUrl
    }
    setUrls(links)
    setLoading(false)
  }

  if (!urls && !loading) {
    return (
      <button onClick={load} style={{ marginTop: '8px', height: '26px', padding: '0 10px', borderRadius: '2px', border: '1px solid #E3E8EF', background: '#FFFFFF', color: '#374151', fontSize: '11px', cursor: 'pointer' }}>
        View receipt documents
      </button>
    )
  }
  if (loading) return <div style={{ marginTop: '8px', fontSize: '11px', color: '#9CA3AF' }}>Loading…</div>
  if (!urls?.receipt && !urls?.payment) return <div style={{ marginTop: '8px', fontSize: '11px', color: '#9CA3AF' }}>Receipt files not found</div>

  return (
    <div style={{ marginTop: '8px', display: 'flex', gap: '12px' }}>
      {urls.receipt && (
        <a href={urls.receipt} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#8C3225', textDecoration: 'underline' }}>View Receipt</a>
      )}
      {urls.payment && (
        <a href={urls.payment} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#8C3225', textDecoration: 'underline' }}>View Payment Proof</a>
      )}
    </div>
  )
}
