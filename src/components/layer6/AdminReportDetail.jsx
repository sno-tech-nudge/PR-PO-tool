import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCSV, reportsToRows } from '../../lib/exportUtils'
import { runAIVouchCheck } from '../../lib/claude'
import ReportChat from '../shared/ReportChat'
import { manualLinkPRToExpense } from '../../lib/linkEngine'
import { getDisplayName } from '../../lib/directory'
import { generateExpenseAttachmentsPDF, downloadPDF } from '../../lib/expenseAttachmentsPdf'
import { ExternalAttachmentLinks } from '../shared/ExpenseAttachments'

const STATUS_CONFIG = {
  submitted:    { label: 'Submitted',     color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  under_review: { label: 'Under Review',  color: 'var(--action)', bg: 'var(--action-bg)' },
  approved:     { label: 'Approved',      color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  processing:   { label: 'Processing',    color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  reimbursed:   { label: 'Reimbursed',    color: 'var(--ink)', bg: 'var(--taupe-50)' },
  rejected:     { label: 'Rejected',      color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
}

const POLICY_CONFIG = {
  passed:    { label: 'Passed',    color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  flagged:   { label: 'Flagged',   color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  violation: { label: 'Violation', color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
}

const AI_VERDICT_CONFIG = {
  pass: { color: 'var(--moss-text)', bg: 'var(--moss-bg)', border: 'var(--moss-border)', icon: 'P' },
  warn: { color: 'var(--gold-text)', bg: 'var(--gold-bg)', border: 'var(--gold-border)', icon: 'W' },
  flag: { color: 'var(--clay-text)', bg: 'var(--clay-bg)', border: 'var(--clay-border)', icon: 'F' },
}

const OVERALL_CONFIG = {
  approve: { label: 'Recommend Approval',    color: 'var(--moss-text)', bg: 'var(--moss-bg)', border: 'var(--moss-border)' },
  query:   { label: 'Query Before Approving', color: 'var(--gold-text)', bg: 'var(--gold-bg)', border: 'var(--gold-border)' },
  flag:    { label: 'Flag — Do Not Approve', color: 'var(--clay-text)', bg: 'var(--clay-bg)', border: 'var(--clay-border)' },
}

function fmtDate(d) {
  if (!d) return '—'
  const ddmm = String(d).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  const dt = ddmm ? new Date(`${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`) : new Date(d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminReportDetail({ reportId, user, onBack, onViewAuditTrail, onViewPO }) {
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
          rejection_reason, vouched_at, vouched_by, finance_notes, pdf_storage_path, po_id,
          report_expenses (
            expense_details (
              id, vendor, category, amount, date, payment_method,
              invoice_number, gstin, description, policy_status,
              expense_type, reimbursement_type, submitted_at, capture_id,
              supporting_attachments, po_pdf_link, vr_pdf_link, er_pdf_link
            )
          )
        `)
        .eq('id', reportId)
        .single(),
      supabase
        .from('report_approvals')
        .select('approver_level, approver_name, approver_email, status, notes, actioned_at, due_at')
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
          <div key={i} style={{ height: '52px', background: 'var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '10px' }} />
        ))}
      </div>
    )
  }

  if (!report) return <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '24px 0' }}>Report not found.</div>

  const expenses  = (report.report_expenses || []).map(re => re.expense_details).filter(Boolean)
  const sc        = STATUS_CONFIG[report.status] || { label: report.status, color: 'var(--text-muted)', bg: 'var(--taupe-50)' }
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
            style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer' }}
          >
            All Reports
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{report.report_reference}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ height: '30px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-200)', fontSize: '12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
          >
            Export CSV
          </button>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              style={{ height: '30px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--action)', border: '1px solid var(--taupe-200)', fontSize: '12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              View PDF
            </a>
          )}
          {user?.role === 'admin' && onViewAuditTrail && (
            <button
              onClick={() => onViewAuditTrail(report.po_id, report.id)}
              disabled={!report.po_id}
              title={report.po_id ? 'Admin only — full Vendor → PR → PO → Expense Report audit trail' : 'This report is not linked to a Purchase Order — no audit trail available'}
              style={{
                height: '30px', padding: '0 12px', fontSize: '12px', cursor: report.po_id ? 'pointer' : 'not-allowed',
                background: 'var(--surface-card)', color: report.po_id ? 'var(--ink)' : 'var(--taupe-400)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
              }}
            >
              Audit Trail
            </button>
          )}
        </div>
      </div>

      {/* Report header card */}
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '4px' }}>{report.report_reference}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.5px' }}>
              INR {Number(report.total_amount || 0).toLocaleString('en-IN')}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
            {isVouched && (
              <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: 'var(--radius-xs)', background: 'var(--moss-bg)', color: 'var(--moss-text)', border: '1px solid var(--moss-border)' }}>
                Vouched
              </span>
            )}
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: 'var(--radius-xs)', background: sc.bg, color: sc.color }}>
              {sc.label}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0', padding: '0' }}>
          {[
            { label: 'Entity',          value: report.brand },
            (report.duration_start || report.duration_end) ? { label: 'Duration', value: [report.duration_start, report.duration_end].filter(Boolean).map(fmtDate).join(' – ') } : null,
            report.business_purpose ? { label: 'Business Purpose', value: report.business_purpose } : null,
            { label: 'Expenses',        value: report.expense_count || expenses.length },
            { label: 'Approval Route',  value: (report.approval_route || '').replace(/_/g, ' ') },
            { label: 'Submitted',       value: fmtDate(report.created_at) },
            report.approved_at   ? { label: 'Approved',   value: fmtDate(report.approved_at) }   : null,
            report.reimbursed_at ? { label: 'Reimbursed', value: fmtDate(report.reimbursed_at) } : null,
            report.rejected_at   ? { label: 'Rejected',   value: fmtDate(report.rejected_at) }   : null,
            isVouched ? { label: 'Vouched', value: `${fmtDate(report.vouched_at)}${report.vouched_by ? ' · ' + report.vouched_by : ''}` } : null,
          ].filter(Boolean).map((f, i) => (
            <div key={i} style={{ padding: '12px 20px', borderRight: '1px solid var(--taupe-100)', borderBottom: '1px solid var(--taupe-100)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{f.label}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>{f.value || '—'}</div>
            </div>
          ))}
        </div>

        {report.rejection_reason && (
          <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: 'var(--clay-bg)', borderRadius: 'var(--radius-xs)', borderLeft: '3px solid var(--clay)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rejection Reason</div>
            <div style={{ fontSize: '12px', color: 'var(--clay-text)' }}>{report.rejection_reason}</div>
          </div>
        )}
      </div>

      {/* Policy alerts */}
      {(violations.length > 0 || flagged.length > 0) && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {violations.length > 0 && (
            <div style={{ flex: 1, minWidth: '200px', background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderLeft: '3px solid var(--clay)', borderRadius: 'var(--radius-xs)', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--clay-text)' }}>
                {violations.length} Policy Violation{violations.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '2px' }}>
                {violations.map(e => e.vendor || 'Unknown').join(' · ')}
              </div>
            </div>
          )}
          {flagged.length > 0 && (
            <div style={{ flex: 1, minWidth: '200px', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderLeft: '3px solid var(--gold)', borderRadius: 'var(--radius-xs)', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gold-text)' }}>
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
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '12px' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Expenses ({expenses.length})
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>
            INR {Number(report.total_amount || 0).toLocaleString('en-IN')}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
              {['Vendor', 'Category', 'Date', 'Invoice', 'GSTIN', 'AI Check', 'Policy', 'Amount (INR)'].map(h => (
                <th key={h} style={{ padding: '8px 14px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: h === 'Amount (INR)' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
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
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
        <div style={{
          padding: '12px 20px', borderBottom: (aiResult || aiLoading) ? '1px solid var(--taupe-200)' : 'none',
          background: oc ? oc.bg : 'var(--taupe-50)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>AI Vouch Check</span>
            {aiResult && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {aiResult.overall?.confidence === 'high' ? 'High confidence' : aiResult.overall?.confidence === 'medium' ? 'Medium confidence' : 'Low confidence'}
              </span>
            )}
          </div>
          <button
            onClick={handleAICheck}
            disabled={aiLoading}
            style={{ height: '28px', padding: '0 12px', background: aiLoading ? 'var(--taupe-100)' : 'var(--action)', color: aiLoading ? 'var(--text-muted)' : 'var(--surface-card)', border: 'none', fontSize: '11px', fontWeight: 600, cursor: aiLoading ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)' }}
          >
            {aiLoading ? 'Analysing…' : aiResult ? 'Re-run' : 'Run Check'}
          </button>
        </div>

        {aiLoading && (
          <div style={{ padding: '16px 20px' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: '12px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-xs)', marginBottom: '8px', width: i === 3 ? '60%' : '100%' }} />
            ))}
          </div>
        )}

        {!aiLoading && aiError && (
          <div style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--clay-text)' }}>{aiError}</div>
        )}

        {!aiLoading && aiResult && oc && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ background: oc.bg, border: `1px solid ${oc.border}`, borderRadius: 'var(--radius-xs)', padding: '10px 14px', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: oc.color, marginBottom: '4px' }}>{oc.label}</div>
              {aiResult.overall?.summary && (
                <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5 }}>{aiResult.overall.summary}</div>
              )}
            </div>
            {aiResult.audit_notes && (
              <button
                onClick={() => setFinanceNotes(aiResult.audit_notes)}
                style={{ width: '100%', height: '32px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px dashed var(--taupe-400)', borderRadius: 'var(--radius-xs)', fontSize: '12px', cursor: 'pointer' }}
              >
                Fill audit notes with AI draft
              </button>
            )}
          </div>
        )}

        {!aiLoading && !aiResult && !aiError && (
          <div style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Run an AI check to get per-expense verdicts, policy analysis, and a pre-drafted audit note.
          </div>
        )}
      </div>

      {/* Approval trail */}
      {approvals.length > 0 && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Approval Trail</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                {['Level', 'Approver', 'Status', 'Notes', 'Date'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {approvals.map((a, i) => {
                const isPending  = !a.actioned_at
                const isApproved = a.status === 'approved'
                const isRejected = a.status === 'rejected' || a.status === 'returned'
                const statusColor = isPending ? 'var(--text-muted)' : isApproved ? 'var(--moss-text)' : isRejected ? 'var(--clay-text)' : 'var(--ink)'
                return (
                  <tr key={i} style={{ borderBottom: i < approvals.length - 1 ? '1px solid var(--taupe-100)' : 'none', background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)' }}>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink)', fontWeight: 600 }}>{a.approver_name || a.approver_level}</td>
                    <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--text-muted)' }}>{a.approver_email ? getDisplayName(a.approver_email) : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: statusColor }}>
                        {a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : 'Pending'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>{a.notes || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {a.actioned_at ? fmtDate(a.actioned_at) : 'Pending'}
                      {a.due_at && isPending && (
                        <div style={{ fontSize: '11px', color: new Date(a.due_at) < new Date() ? 'var(--clay-text)' : 'var(--gold-text)' }}>
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
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Finance Review</span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Audit Notes / Queries</div>
          <textarea
            value={financeNotes}
            onChange={e => setFinanceNotes(e.target.value)}
            placeholder="Add vouching notes, queries, or audit remarks…"
            rows={4}
            style={{
              width: '100%', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
              padding: '10px 12px', fontSize: '13px', color: 'var(--ink)',
              outline: 'none', resize: 'vertical', marginBottom: '12px',
              boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
              background: 'var(--taupe-50)',
            }}
          />

          {savedMsg && <div style={{ fontSize: '12px', color: 'var(--moss-text)', marginBottom: '8px', fontWeight: 600 }}>{savedMsg}</div>}
          {vouchError && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>{vouchError}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            {!isVouched ? (
              <button
                onClick={handleVouch}
                disabled={vouching}
                style={{ height: '34px', padding: '0 20px', background: vouching ? 'var(--text-muted)' : 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: vouching ? 'default' : 'pointer' }}
              >
                {vouching ? 'Saving…' : 'Mark as Vouched'}
              </button>
            ) : (
              <button
                onClick={handleSaveNotes}
                disabled={vouching}
                style={{ height: '34px', padding: '0 20px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: vouching ? 'default' : 'pointer' }}
              >
                {vouching ? 'Saving…' : 'Update Notes'}
              </button>
            )}
          </div>

          {isVouched && (
            <div style={{ fontSize: '11px', color: 'var(--moss-text)', marginTop: '8px', fontWeight: 500 }}>
              Vouched {fmtDate(report.vouched_at)}{report.vouched_by ? ` by ${report.vouched_by}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* PO Link */}
      {report.po_id && <POLinkSection poId={report.po_id} onViewPO={onViewPO} />}

      {/* PR Link */}
      <PRLinkSection reportId={reportId} report={report} onLinked={load} />

      {/* Comments */}
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Comments</span>
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
          borderBottom: expanded || i < total - 1 ? '1px solid var(--taupe-100)' : 'none',
          background: av ? av.bg : i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)',
          cursor: 'pointer',
        }}
      >
        <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 500, color: 'var(--ink)' }}>
          {exp.vendor || 'Unknown vendor'}
        </td>
        <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink)' }}>{exp.category || '—'}</td>
        <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(exp.date)}</td>
        <td style={{ padding: '10px 14px', fontSize: '11px', color: exp.invoice_number ? 'var(--ink)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
          {exp.invoice_number || 'Missing'}
        </td>
        <td style={{ padding: '10px 14px', fontSize: '11px', color: exp.gstin ? 'var(--ink)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
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
          ) : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
        </td>
        <td style={{ padding: '10px 14px' }}>
          {pc ? (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: 'var(--radius-xs)', background: pc.bg, color: pc.color }}>{pc.label}</span>
          ) : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
        </td>
        <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--ink)', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {Number(exp.amount || 0).toLocaleString('en-IN')}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: i < total - 1 ? '1px solid var(--taupe-100)' : 'none' }}>
          <td colSpan={8} style={{ padding: '0 14px 12px', background: 'var(--taupe-50)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', paddingTop: '10px' }}>
              {exp.payment_method && <MiniField label="Payment" value={exp.payment_method} />}
              {exp.expense_type && <MiniField label="Type" value={exp.expense_type === 'just_me' ? 'Personal' : exp.expense_type === 'multiple_people' ? 'Team' : exp.expense_type} />}
              {exp.reimbursement_type && <MiniField label="Reimbursement" value={exp.reimbursement_type} />}
              {exp.gstin && <MiniField label="GSTIN" value={exp.gstin} mono />}
              {exp.invoice_number && <MiniField label="Invoice No." value={exp.invoice_number} mono />}
              {exp.description && <MiniField label="Note" value={exp.description} />}
            </div>
            {exp.capture_id && <ReceiptLink captureId={exp.capture_id} />}
            {!exp.capture_id && !exp.po_pdf_link && !exp.vr_pdf_link && !exp.er_pdf_link && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>No receipt linked</div>
            )}
            <ExternalAttachmentLinks poLink={exp.po_pdf_link} vrLink={exp.vr_pdf_link} erLink={exp.er_pdf_link} />
            {exp.supporting_attachments?.length > 0 && (
              <SupportingAttachments attachments={exp.supporting_attachments} />
            )}
            {(exp.capture_id || exp.supporting_attachments?.length > 0) && (
              <DownloadAttachmentsButton captureId={exp.capture_id} attachments={exp.supporting_attachments} />
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
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink)', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
    </div>
  )
}

const LINK_CONF_COLORS = {
  high:   { label: 'High confidence',   color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  medium: { label: 'Medium confidence', color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  manual: { label: 'Manually linked',   color: 'var(--action)', bg: 'var(--action-bg)' },
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
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Linked Purchase Request</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {linkedPR ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--action)', fontFamily: 'monospace' }}>{linkedPR.pr_number}</span>
              {lc && (
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: 'var(--radius-xs)', background: lc.bg, color: lc.color }}>{lc.label}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink)' }}>
              {linkedPR.vendors?.org_name} · INR {Number(linkedPR.amount || 0).toLocaleString('en-IN')} · {linkedPR.status}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>No purchase request linked. Search by PR number or vendor to link one manually.</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="PR number or vendor name…"
                style={{ flex: 1, height: '32px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '12px', outline: 'none', color: 'var(--ink)' }}
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                style={{ height: '32px', padding: '0 14px', background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>{error}</div>}
            {success && <div style={{ fontSize: '12px', color: 'var(--moss-text)', marginBottom: '8px' }}>{success}</div>}
            {results.map(pr => (
              <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '6px', background: 'var(--taupe-50)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--action)', fontFamily: 'monospace' }}>{pr.pr_number}</span>
                  <span style={{ fontSize: '12px', color: 'var(--ink)', marginLeft: '10px' }}>{pr.vendors?.org_name} · INR {Number(pr.amount || 0).toLocaleString('en-IN')}</span>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{getDisplayName(pr.requested_by)}</div>
                </div>
                <button
                  onClick={() => handleLink(pr.id)}
                  disabled={linking}
                  style={{ height: '28px', padding: '0 12px', background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '11px', cursor: 'pointer' }}
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

function SupportingAttachments({ attachments }) {
  const [urls, setUrls]       = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (urls || loading) return
    setLoading(true)
    const signed = {}
    for (const a of attachments) {
      const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(a.path, 3600)
      if (s?.signedUrl) signed[a.path] = s.signedUrl
    }
    setUrls(signed)
    setLoading(false)
  }

  if (!urls && !loading) {
    return (
      <button onClick={load} style={{ marginTop: '8px', height: '26px', padding: '0 10px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)', color: 'var(--ink)', fontSize: '11px', cursor: 'pointer' }}>
        View other attachments ({attachments.length})
      </button>
    )
  }
  if (loading) return <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      {attachments.map((a, i) => (
        urls[a.path] ? (
          <a key={i} href={urls[a.path]} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--action)', textDecoration: 'underline' }}>
            View {a.label}
          </a>
        ) : (
          <span key={i} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.label} not found</span>
        )
      ))}
    </div>
  )
}

// Merges the receipt, payment proof, and any supporting_attachments into
// one downloadable PDF — reuses the same pdf-lib merge built for vendor
// profile PDFs (src/lib/pdfMerge.js) via src/lib/expenseAttachmentsPdf.js.
function DownloadAttachmentsButton({ captureId, attachments }) {
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState(null)

  async function handleDownload() {
    setBusy(true)
    setError(null)
    try {
      const documents = []
      if (captureId) {
        const { data } = await supabase.from('expense_captures').select('receipt_storage_path, payment_storage_path').eq('id', captureId).single()
        if (data?.receipt_storage_path) {
          const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(data.receipt_storage_path, 3600)
          if (s?.signedUrl) documents.push({ label: 'Receipt', url: s.signedUrl, path: data.receipt_storage_path })
        }
        if (data?.payment_storage_path) {
          const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(data.payment_storage_path, 3600)
          if (s?.signedUrl) documents.push({ label: 'Payment proof', url: s.signedUrl, path: data.payment_storage_path })
        }
      }
      for (const a of attachments || []) {
        const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(a.path, 3600)
        if (s?.signedUrl) documents.push({ label: a.label, url: s.signedUrl, path: a.path })
      }
      if (documents.length === 0) { setError('No documents found.'); setBusy(false); return }

      const blob = await generateExpenseAttachmentsPDF({ documents, onProgress: setStep })
      downloadPDF(blob, 'expense-attachments.pdf')
    } catch (err) {
      console.error('Attachments PDF error:', err)
      setError('Could not generate the PDF.')
    }
    setBusy(false)
    setStep('')
  }

  return (
    <div style={{ marginTop: '8px' }}>
      <button
        onClick={handleDownload}
        disabled={busy}
        style={{ height: '26px', padding: '0 10px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)', color: busy ? 'var(--text-muted)' : 'var(--action)', fontSize: '11px', cursor: busy ? 'default' : 'pointer' }}
      >
        {busy ? (step || 'Preparing PDF…') : 'Download attachments (PDF)'}
      </button>
      {error && <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--clay-text)' }}>{error}</div>}
    </div>
  )
}

function POLinkSection({ poId, onViewPO }) {
  const [po, setPo] = useState(null)

  useEffect(() => {
    supabase.from('purchase_orders').select('id, po_number, amount, status, vendors(org_name)').eq('id', poId).single()
      .then(({ data }) => setPo(data))
  }, [poId])

  if (!po) return null

  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Linked Purchase Order</span>
        {onViewPO && (
          <button
            onClick={() => onViewPO(po.id)}
            style={{ height: '26px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--action)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', fontSize: '11px', cursor: 'pointer' }}
          >
            View PO
          </button>
        )}
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--action)', fontFamily: 'monospace', marginBottom: '6px' }}>{po.po_number}</div>
        <div style={{ fontSize: '12px', color: 'var(--ink)' }}>
          {po.vendors?.org_name} · INR {Number(po.amount || 0).toLocaleString('en-IN')} · {po.status}
        </div>
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
      <button onClick={load} style={{ marginTop: '8px', height: '26px', padding: '0 10px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)', color: 'var(--ink)', fontSize: '11px', cursor: 'pointer' }}>
        View receipt documents
      </button>
    )
  }
  if (loading) return <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>Loading…</div>
  if (!urls?.receipt && !urls?.payment) return <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>Receipt files not found</div>

  return (
    <div style={{ marginTop: '8px', display: 'flex', gap: '12px' }}>
      {urls.receipt && (
        <a href={urls.receipt} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--action)', textDecoration: 'underline' }}>View Receipt</a>
      )}
      {urls.payment && (
        <a href={urls.payment} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--action)', textDecoration: 'underline' }}>View Payment Proof</a>
      )}
    </div>
  )
}
