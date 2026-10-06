import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { determineApprovalRoute, checkLargeClaimDonorMention, flagEntityContext } from '../../lib/policyEngine'
import { getApprovalRules } from '../../lib/approvalEngine'
import { generateExpenseReportPDF, downloadPDF, uploadPDFToSupabase } from '../../lib/pdfGenerator'
import { generateReportReference } from '../../lib/reportReference'
import { sendReportEmail } from '../../lib/reportEmail'
import { attachPendingBalances } from '../../lib/poBalance'
import ReportSummaryCard from './ReportSummaryCard'
import ExpenseLineItem from './ExpenseLineItem'
import PDFTemplate from './PDFTemplate'
import GeneratingPDF from './GeneratingPDF'
import PolicyViolation from '../layer3/PolicyViolation'
import PolicyFlag from '../layer3/PolicyFlag'
import { useIsMobile } from '../../hooks/useIsMobile'
import { logActivity } from '../../lib/activityLog'

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

// Every expense already states its own Entity (ExpenseDetails) — rather than
// ask again at the report level, pick whichever entity shows up most often
// across the included expenses. Drives FCRA/TNF-US policy flagging and the
// report's own entity tag below.
function mostCommonEntity(expenses) {
  const counts = {}
  for (const e of expenses || []) {
    if (!e.entity) continue
    counts[e.entity] = (counts[e.entity] || 0) + 1
  }
  const entries = Object.entries(counts)
  if (!entries.length) return null
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0]
}

export default function ReportPreview({ expenses, results, reportDetails, user, onSubmitted, onBack }) {
  const isMobile = useIsMobile()
  // Defensive only — NewReportModal already generates and saves the real
  // report_reference before this screen is ever reached, so this almost
  // never actually gets used. Kept correctly prefixed anyway: vendor if the
  // report's own po_related/po_id says so, or any of its expenses are
  // themselves tied to a PO or a registered vendor.
  const [fallbackReference] = useState(() => generateReportReference(
    reportDetails?.po_related === true || reportDetails?.po_id != null
      || expenses.some(e => e.po_number || e.vendor_id)
  ))
  const reference = reportDetails?.report_reference || fallbackReference
  const reportId = reportDetails?.report_id || null

  const [pdfCache, setPdfCache] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [generatingText, setGeneratingText] = useState('Preparing your report')
  const [downloadedMsg, setDownloadedMsg] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [rules, setRules] = useState([])

  // Purchase Order relation — answered once when the report was created
  // (NewReportModal) and never asked again here; a PO-linked report still gets
  // its pending-balance check below before it can be submitted.
  const poRelated = reportDetails?.po_related === true
  const [selectedPOId, setSelectedPOId] = useState(reportDetails?.linked_po_id || '')
  const [poOptions, setPoOptions] = useState([])
  const [poPending, setPoPending] = useState(null)
  const [poLoading, setPoLoading] = useState(false)

  useEffect(() => { getApprovalRules(supabase).then(setRules) }, [])

  useEffect(() => {
    if (poRelated !== true || poOptions.length) return
    supabase.from('purchase_orders')
      .select('id, po_number, amount, vendors(org_name), purchase_requests!inner(requested_by)')
      .eq('status', 'issued')
      .in('purchase_requests.requested_by', user?.ownEmails ?? [])
      .order('created_at', { ascending: false }).limit(200)
      .then(async ({ data }) => setPoOptions(await attachPendingBalances(data || [])))
  }, [poRelated, poOptions.length, user?.email])

  // The PO answered when the report was created only has its id — run the
  // same pending-balance check once the option list (needed to look up its
  // po_number) has loaded, so the pre-filled selection shows a real balance.
  useEffect(() => {
    if (poRelated === true && selectedPOId && poOptions.length && !poPending && !poLoading) {
      handleSelectPO(selectedPOId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poOptions, poRelated, selectedPOId, poPending, poLoading])

  async function handleSelectPO(id) {
    setSelectedPOId(id)
    setPoPending(null)
    if (!id) return
    setPoLoading(true)
    const po = poOptions.find(p => p.id === id)
    const [{ data: linkedReports }, { data: savedExpenses }] = await Promise.all([
      supabase.from('expense_reports').select('total_amount, status').eq('po_id', id),
      supabase.from('expense_details').select('amount').eq('po_number', po?.po_number || '').eq('status', 'saved'),
    ])
    const reportsTotal = (linkedReports || []).filter(r => r.status !== 'rejected').reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
    const savedTotal = (savedExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const claimed = reportsTotal + savedTotal
    const pending = Math.max(0, (Number(po?.amount) || 0) - claimed)
    setPoPending({ amount: po?.amount, pending })
    setPoLoading(false)
  }

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const poSectionValid = !poRelated || (!!selectedPOId && !!poPending && total <= poPending.pending)
  const period = getPeriod(expenses)
  const approvalRoute = determineApprovalRoute(expenses, rules)
  const entity = mostCommonEntity(expenses)
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

  // Entity is derived right above (mostCommonEntity) rather than asked — re-run
  // the entity-aware checks here so FCRA/TNF-US flagging actually fires. Advisory
  // only, same as every other policy check in this app; never blocks submission.
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

  // Rule violations from the policy check plus the entity-aware ones above,
  // one entry per expense + rule.
  const allViolations = (() => {
    const seen = new Set()
    return [
      ...(results || []).flatMap((r, i) => (r?.violations || []).map(v => ({ ...v, expense: expenses[i] }))),
      ...entityViolations,
    ].filter(v => {
      const key = `${v.expense?.id}:${v.rule}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

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
    if (!poSectionValid) {
      setSubmitError(
        !selectedPOId
          ? 'This report is not linked to a Purchase Order. Go back and start the report again.'
          : `This report's ₹${Number(total).toLocaleString('en-IN')} exceeds the ₹${Number(poPending?.pending ?? 0).toLocaleString('en-IN')} still pending on the selected PO.`
      )
      return
    }
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
      po_related: poRelated,
    }

    try {
      const { data: report, error } = reportId
        ? await supabase.from('expense_reports').update(reportPayload).eq('id', reportId).select().single()
        : await supabase.from('expense_reports').insert(reportPayload).select().single()

      if (error) throw error
      logActivity({ entityType: 'report', entityId: report.id, entityRef: reference, action: reportId ? 'resubmitted' : 'submitted', toValue: 'submitted', actor: user, note: `Total ₹${Number(total || 0).toLocaleString('en-IN')} · ${expenses.length} expense(s)` })

      await supabase
        .from('report_expenses')
        .insert(expenses.map(e => ({ report_id: report.id, expense_id: e.id })))

      // Flips these out of the 'saved' pool every "available expenses" query
      // filters on (enterReportWorkspace, ExpenseSelector.refetch, the
      // Unreported count) — without this they'd keep showing up as
      // selectable in every future report forever.
      await supabase
        .from('expense_details')
        .update({ status: 'reported', policy_status: 'submitted', approval_route: approvalRoute.route })
        .in('id', expenses.map(e => e.id))

      // policy_status above is overwritten with 'submitted' for every report,
      // so keep what the rule engine actually found per expense — this is
      // what the Finance Policy Violations dashboard reads. Best-effort.
      ;(results || []).forEach((r, i) => {
        const exp = expenses[i]
        if (!exp) return
        const items = [
          ...(r?.violations || []).map(v => ({ kind: 'violation', rule: v.rule, message: v.message || '', severity: v.severity || null })),
          ...(r?.flags || []).map(f => ({ kind: 'flag', rule: f.rule, message: f.message || '', severity: f.severity || null })),
        ]
        if (!items.length && !exp.policy_flags) return
        supabase.from('expense_details').update({ policy_flags: items.length ? items : null }).eq('id', exp.id).then(({ error: flagErr }) => {
          if (flagErr) console.error('Saving policy flags failed:', flagErr.message)
        })
      })

      // The person's "is this related to a PO?" answer — pre-filled from
      // NewReportModal but editable right here, and validated above
      // (poSectionValid) before submission is ever allowed — is authoritative.
      // Link the report to the chosen PO and back-fill po_number onto any
      // included expense so PODetail's pending-balance tracking picks this
      // report up too — but never overwrite a po_number an expense already
      // carries (e.g. one captured via SubmitPOExpense against a *different* PO).
      if (poRelated && selectedPOId) {
        await supabase.from('expense_reports').update({ po_id: selectedPOId }).eq('id', report.id)
        const { data: linkedPO } = await supabase.from('purchase_orders').select('po_number').eq('id', selectedPOId).maybeSingle()
        if (linkedPO) {
          const unTaggedIds = expenses.filter(e => !e.po_number).map(e => e.id)
          if (unTaggedIds.length) {
            await supabase.from('expense_details').update({ po_number: linkedPO.po_number }).in('id', unTaggedIds)
          }
        }
      }

      sendReportEmail({
        type: 'submitted', recipientEmail: user?.email, reportReference: reference,
        amount: total, currentStep: 0,
      })

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
        expenses,
        results,
        reportDetails,
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
            fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
            textDecoration: 'underline', flexShrink: 0,
          }}
        >
          ← Back
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Expense Report</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{reference}</div>
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

        {/* Linked Purchase Order — read-only, chosen when the report was started */}
        {poRelated && (
          <div style={{ border: '1px solid var(--moss-border)', background: 'var(--moss-bg)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginTop: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--moss-text)' }}>
              Paying against Purchase Order{' '}
              <strong style={{ fontFamily: 'monospace' }}>{poOptions.find(p => p.id === selectedPOId)?.po_number || '…'}</strong>
            </div>
            {poLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Checking pending balance…</div>}
            {poPending && (
              <div style={{ fontSize: '12px', color: total > poPending.pending ? 'var(--clay-text)' : 'var(--text-muted)', marginTop: '6px' }}>
                PO amount ₹{Number(poPending.amount).toLocaleString('en-IN')} · pending ₹{Number(poPending.pending).toLocaleString('en-IN')}
                {total > poPending.pending && ` — this report's ₹${Number(total).toLocaleString('en-IN')} exceeds what's still pending on this PO.`}
              </div>
            )}
          </div>
        )}

        {/* Policy flags — advisory only, shown here (not earlier in the flow) */}
        {(allViolations.length > 0 || allFlags.length > 0) && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gold-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
              Policy flags
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
              These are advisory. You can still submit, and your approver will see them.
            </div>
            {allViolations.map((v, i) => <PolicyViolation key={`v${i}`} violation={v} expense={v.expense} />)}
            {allFlags.map((f, i) => <PolicyFlag key={`f${i}`} flag={f} expense={f.expense} />)}
          </div>
        )}

        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', margin: '20px 0 12px' }}>
          Expenses included
        </div>

        {expenses.map((exp, i) => (
          <ExpenseLineItem
            key={exp.id}
            expense={exp}
            result={results?.[i]}
          />
        ))}

      </div>

      {/* Fixed bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: isMobile ? 0 : '220px', right: 0, zIndex: 10 }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: 'var(--surface-card)', borderTop: '1px solid var(--taupe-200)', padding: '16px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '10px' }}>
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''} · ₹{Number(total).toLocaleString('en-IN')}
          </div>

          {downloadedMsg && (
            <div style={{ fontSize: '12px', color: 'var(--moss)', marginBottom: '8px' }}>PDF downloaded</div>
          )}
          {downloadError && (
            <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>
              Could not generate PDF. Please try again.
            </div>
          )}
          {submitError && (
            <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>{submitError}</div>
          )}
          {!submitError && !poSectionValid && (
            <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>
              {!selectedPOId
                ? 'This report is not linked to a Purchase Order. Go back and start the report again.'
                : 'This report exceeds what’s still pending on the selected PO.'}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleDownload}
              disabled={generating}
              style={{
                width: '100%', height: '48px',
                background: 'var(--surface-card)', color: generating ? 'var(--text-muted)' : 'var(--text)',
                border: `1px solid ${generating ? 'var(--taupe-200)' : 'var(--text)'}`,
                fontSize: '14px', fontWeight: 500,
                cursor: generating ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)',
              }}
            >
              Download PDF
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !poSectionValid}
              style={{
                width: '100%', height: '48px',
                background: submitting || !poSectionValid ? 'var(--text-muted)' : 'var(--text)',
                color: 'var(--surface-card)', border: 'none',
                fontSize: '14px', fontWeight: 500,
                cursor: submitting || !poSectionValid ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)',
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
