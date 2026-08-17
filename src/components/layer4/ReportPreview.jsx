import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { determineApprovalRoute, checkLargeClaimDonorMention, flagEntityContext } from '../../lib/policyEngine'
import { generateExpenseReportPDF, downloadPDF, uploadPDFToSupabase } from '../../lib/pdfGenerator'
import { generateReportReference } from '../../lib/reportReference'
import ReportSummaryCard from './ReportSummaryCard'
import ExpenseLineItem from './ExpenseLineItem'
import PDFTemplate from './PDFTemplate'
import GeneratingPDF from './GeneratingPDF'

function parseExpenseDate(dateStr) {
  if (!dateStr) return null
  const ddmm = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return new Date(parseInt(ddmm[3]), parseInt(ddmm[2]) - 1, parseInt(ddmm[1]))
  const dash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return new Date(parseInt(dash[3]), parseInt(dash[2]) - 1, parseInt(dash[1]))
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

function formatDateLong(d) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function getPeriod(expenses) {
  const dates = expenses.map(e => parseExpenseDate(e.date)).filter(Boolean).sort((a, b) => a - b)
  if (!dates.length) return '—'
  if (dates.length === 1) return formatDateLong(dates[0])
  return `${formatDateLong(dates[0])} to ${formatDateLong(dates[dates.length - 1])}`
}

export default function ReportPreview({ expenses, results, reportDetails, user, onSubmitted, onBack }) {
  const [fallbackReference] = useState(() => generateReportReference())
  const reference = reportDetails?.report_reference || fallbackReference
  const reportId = reportDetails?.report_id || null

  const [pdfCache, setPdfCache] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [generatingText, setGeneratingText] = useState('Preparing your report')
  const [downloadedMsg, setDownloadedMsg] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const period = getPeriod(expenses)
  const approvalRoute = determineApprovalRoute(expenses)
  const entity = reportDetails?.entity || null
  const generatedAt = new Date().toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const reportData = useMemo(() => ({
    reference,
    entity,
    period,
    approvalRoute,
    generatedAt,
    results,
    reportDetails,
  }), [reference, entity, period, approvalRoute, generatedAt, results, reportDetails])

  // Entity is only known at this stage (chosen in ReportDetails, Layer 4) — re-run the
  // entity-aware checks here so FCRA/TNF-US flagging actually fires. Advisory only, same
  // as every other policy check in this app; never blocks submission.
  const entityChecks = entity
    ? expenses.map(exp => ({
        expense: exp,
        donor: checkLargeClaimDonorMention({ ...exp, entity }),
        ctx: flagEntityContext({ ...exp, entity }),
      }))
    : []
  const entityViolations = entityChecks
    .filter(c => c.donor.passed === false)
    .map(c => ({ ...c.donor, expense: c.expense }))
  const entityFlags = entityChecks
    .filter(c => c.ctx.flagged === true)
    .map(c => ({ ...c.ctx, expense: c.expense }))

  const allFlags = [
    ...(results || []).flatMap((r, i) =>
      (r?.flags?.filter(f => !f.internalOnly) || []).map(f => ({ ...f, expense: expenses[i] }))
    ),
    ...entityFlags,
  ]

  async function getOrGeneratePDF() {
    if (pdfCache) return pdfCache
    const pdf = await generateExpenseReportPDF(expenses, reportData)
    if (pdf) setPdfCache(pdf)
    return pdf
  }

  async function handleDownload() {
    setDownloadError(false)
    setGeneratingText('Preparing your report')
    setGenerating(true)
    try {
      const pdf = await getOrGeneratePDF()
      if (!pdf) {
        setDownloadError(true)
        setGenerating(false)
        return
      }
      const dateStr = new Date().toISOString().slice(0, 10)
      downloadPDF(pdf, `expense-report-${reference}-${dateStr}.pdf`)
      setGenerating(false)
      setDownloadedMsg(true)
      setTimeout(() => setDownloadedMsg(false), 2000)
    } catch {
      setDownloadError(true)
      setGenerating(false)
    }
  }

  async function handleSubmit() {
    setSubmitError(null)
    setGeneratingText('Preparing your report')
    setGenerating(true)
    setSubmitting(true)

    let pdf = null
    let pdfPath = null

    try {
      pdf = await getOrGeneratePDF()
    } catch {
      // Non-blocking — continue without PDF
    }

    if (pdf) {
      try {
        const filename = `${reference}.pdf`
        pdfPath = await uploadPDFToSupabase(pdf, filename, supabase)
      } catch {
        // Non-blocking
      }
    }

    const reportPayload = {
      report_reference: reference,
      brand: entity,
      total_amount: total,
      expense_count: expenses.length,
      approval_route: approvalRoute.route,
      status: 'submitted',
      pdf_storage_path: pdfPath || null,
      selected_expense_ids: expenses.map(e => e.id),
      employee_email: user?.email ?? null,
    }

    try {
      const { data: report, error } = reportId
        ? await supabase.from('expense_reports').update(reportPayload).eq('id', reportId).select().single()
        : await supabase.from('expense_reports').insert(reportPayload).select().single()

      if (error) throw error

      await supabase
        .from('report_expenses')
        .insert(expenses.map(e => ({ report_id: report.id, expense_id: e.id })))

      await supabase
        .from('expense_details')
        .update({ policy_status: 'submitted', approval_route: approvalRoute.route })
        .in('id', expenses.map(e => e.id))

      setGenerating(false)
      setSubmitting(false)
      onSubmitted({
        reference,
        approvalRoute,
        expenseCount: expenses.length,
        total,
        pdfPath,
        pdf,
        entity,
        pdfUploadPending: !!pdf && !pdfPath,
      })
    } catch {
      setSubmitError('Could not submit. Please try again.')
      setGenerating(false)
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%', paddingBottom: '140px' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          onClick={onBack}
          style={{
            fontSize: '13px', color: '#4A4A4A', cursor: 'pointer',
            textDecoration: 'underline', flexShrink: 0,
          }}
        >
          ← Back
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#6B6B6B' }}>Expense Report</div>
          <div style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'monospace' }}>{reference}</div>
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        <ReportSummaryCard
          reference={reference}
          entity={entity}
          period={period}
          expenseCount={expenses.length}
          total={total}
          approvalRoute={approvalRoute}
          generatedAt={generatedAt}
          reportDetails={reportDetails}
          businessPurpose={reportDetails?.business_purpose}
          durationStart={reportDetails?.duration_start}
          durationEnd={reportDetails?.duration_end}
        />

        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', margin: '20px 0 12px' }}>
          Expenses included
        </div>

        {expenses.map((exp, i) => (
          <ExpenseLineItem
            key={exp.id}
            expense={exp}
            result={results?.[i]}
          />
        ))}

        {entityViolations.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#DC2626', marginBottom: '10px' }}>
              Policy notes
            </div>
            {entityViolations.map((v, i) => (
              <div key={i} style={{
                border: '1px solid #DC2626', background: '#FEF2F2',
                padding: '12px 16px', marginBottom: '8px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#1A1A1A', marginBottom: '4px' }}>
                  {v.expense?.vendor} {v.expense?.amount ? `· ₹${Number(v.expense.amount).toLocaleString('en-IN')}` : ''}
                </div>
                <div style={{ fontSize: '12px', color: '#DC2626', lineHeight: '1.4' }}>
                  Policy note — {v.message}
                </div>
              </div>
            ))}
          </div>
        )}

        {allFlags.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#CA8A04', marginBottom: '10px' }}>
              Notes for approver
            </div>
            {allFlags.map((flag, i) => (
              <div key={i} style={{
                border: '1px solid #CA8A04', background: '#FEFCE8',
                padding: '12px 16px', marginBottom: '8px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#1A1A1A', marginBottom: '4px' }}>
                  {flag.expense?.vendor} {flag.expense?.amount ? `· ₹${Number(flag.expense.amount).toLocaleString('en-IN')}` : ''}
                </div>
                <div style={{ fontSize: '12px', color: '#CA8A04', lineHeight: '1.4' }}>
                  {flag.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: '#FFFFFF', borderTop: '1px solid #E8E8E8', padding: '16px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', marginBottom: '10px' }}>
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''} · ₹{Number(total).toLocaleString('en-IN')}
          </div>

          {downloadedMsg && (
            <div style={{ fontSize: '12px', color: '#16A34A', marginBottom: '8px' }}>PDF downloaded</div>
          )}
          {downloadError && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>
              Could not generate PDF. Please try again.
            </div>
          )}
          {submitError && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>{submitError}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleDownload}
              disabled={generating}
              style={{
                width: '100%', height: '48px',
                background: '#FFFFFF', color: generating ? '#9CA3AF' : '#1A1A1A',
                border: `1px solid ${generating ? '#E8E8E8' : '#1A1A1A'}`,
                fontSize: '14px', fontWeight: 500,
                cursor: generating ? 'default' : 'pointer', borderRadius: '4px',
              }}
            >
              Download PDF
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: '100%', height: '48px',
                background: submitting ? '#9CA3AF' : '#1A1A1A',
                color: '#FFFFFF', border: 'none',
                fontSize: '14px', fontWeight: 500,
                cursor: submitting ? 'default' : 'pointer', borderRadius: '4px',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit for approval'}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden PDF template */}
      <PDFTemplate expenses={expenses} reportData={reportData} />

      <GeneratingPDF visible={generating} text={generatingText} />
    </div>
  )
}
