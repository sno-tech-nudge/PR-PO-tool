import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { determineApprovalRoute } from '../../lib/policyEngine'
import { createApprovalRecords } from '../../lib/approvalEngine'
import { EXPENSE_NATURES } from '../../lib/donorData'
import { PR_CATEGORIES } from '../../lib/prConstants'
import AttachmentDropzone from '../shared/AttachmentDropzone'
import AmountInput from '../shared/AmountInput'

// Not personal-expense payment instruments (that's ExpenseDetails.jsx's
// PAYMENT_MODES, e.g. "Self - UPI"/"Company Card") — this is how Finance
// actually paid the vendor for this invoice, a different concept, kept as
// its own small list local to this form rather than reusing that vocabulary.
const PAYMENT_METHODS = ['Bank Transfer', 'Cheque', 'UPI', 'Other']
const ATTACHMENT_LABELS = ['Invoice', 'Receipt', 'Quotation', 'Other']

function fmtAmt(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

function generateReference() {
  const year = new Date().getFullYear()
  return 'TNI' + year + Math.floor(1000 + Math.random() * 9000)
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
        {label}{required && <span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>}
      </div>
      {children}
    </div>
  )
}

function SectionCard({ title, sub, children }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{title}</div>
      {sub && <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '14px' }}>{sub}</div>}
      {!sub && <div style={{ marginBottom: '10px' }} />}
      {children}
    </div>
  )
}

const inputStyle = { width: '100%', height: '38px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }
const textareaStyle = { width: '100%', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '10px', fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }

// Two-stage tranche/invoice submission against an already-issued PO.
// Stage 1 is a quick popup for the core invoice numbers; Stage 2 is a
// full-screen review that pre-fills everything already known from the
// approved Purchase Request (entity, program, subprogram, donor, category,
// expense nature, purpose) — editable, since one specific invoice can
// differ slightly from what was originally requested — plus attachments
// and the final report name/description. Deliberately not the full
// 4-layer capture flow (no OCR, no policy checks) — the PR/PO were
// already approved; this only needs to confirm/adjust that context,
// attach supporting documents, and enter this submission into the same
// report_approvals chain any other expense report uses. Submitting here
// never touches the PR/PO's own status — only the resulting
// expense_reports row goes through approval.
export default function SubmitPOExpense({ po, pr, vendor, user, pending, onClose, onSubmitted }) {
  const [stage, setStage] = useState(1)

  // Stage 1 — this invoice's core numbers.
  const [amount, setAmount] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [stage1Error, setStage1Error] = useState(null)

  // Stage 2 — pre-filled from the PR, editable.
  const [entity, setEntity] = useState(pr?.entity || '')
  const [program, setProgram] = useState(pr?.program || '')
  const [subprogram, setSubprogram] = useState(pr?.subprogram || '')
  const [donor, setDonor] = useState(pr?.donor_name || '')
  const [category, setCategory] = useState(pr?.category?.split(',')[0]?.trim() || '')
  const [expenseNature, setExpenseNature] = useState(pr?.expense_type || '')
  const [description, setDescription] = useState(pr?.purpose || '')
  const [gstin, setGstin] = useState(vendor?.gstin || '')

  // Stage 2 — attachments (first row is the primary invoice document).
  const [attachments, setAttachments] = useState([{ label: 'Invoice', file: null }])

  // Stage 2 — final report identity, asked right before submitting.
  const [reportName, setReportName] = useState(generateReference())
  const [reportDescription, setReportDescription] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const amt = Number(amount)
  const overPending = amount !== '' && amt > pending

  function handleContinue() {
    if (!amount || amt <= 0) { setStage1Error('Enter an invoice amount.'); return }
    if (overPending) { setStage1Error(`Amount cannot exceed the pending PO balance of ${fmtAmt(pending)}.`); return }
    setStage1Error(null)
    setStage(2)
  }

  function updateAttachment(i, patch) {
    setAttachments(prev => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }
  function addAttachment() {
    setAttachments(prev => [...prev, { label: 'Other', file: null }])
  }
  function removeAttachment(i) {
    setAttachments(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    if (!amount || amt <= 0 || overPending) { setError('Check the invoice amount before submitting.'); return }
    if (!attachments[0]?.file) { setError('Attach the invoice for this payment.'); return }
    if (!reportDescription.trim()) { setError('Add a short description of this report.'); return }
    if (!reportName.trim()) { setError('Enter a report name.'); return }

    setSaving(true)
    setError(null)

    try {
      const uploaded = []
      for (const a of attachments) {
        if (!a.file) continue
        const path = `po-invoices/${po.po_number}/${Date.now()}-${a.label}-${a.file.name}`
        const { error: uploadErr } = await supabase.storage.from('expense-documents').upload(path, a.file)
        if (uploadErr) throw uploadErr
        uploaded.push({ path, label: a.label })
      }
      const [primary, ...rest] = uploaded

      const { data: captureRow, error: captureErr } = await supabase
        .from('expense_captures')
        .insert({ receipt_storage_path: primary.path, single_document: true, status: 'captured' })
        .select('id')
        .single()
      if (captureErr) throw captureErr

      const { data: detail, error: detailErr } = await supabase
        .from('expense_details')
        .insert({
          amount: amt,
          vendor: vendor?.org_name || null,
          vendor_id: vendor?.id || null,
          date: new Date().toISOString().slice(0, 10),
          category: category || null,
          expense_type: 'purchase_order_tranche',
          expense_nature: expenseNature || null,
          description: description.trim() || null,
          entity: entity.trim() || null,
          program: program.trim() || null,
          subprogram: subprogram.trim() || null,
          donor_name: donor.trim() || null,
          gstin: gstin.trim() || null,
          invoice_number: invoiceNumber.trim() || null,
          payment_method: paymentMethod || null,
          po_number: po.po_number || null,
          supporting_attachments: rest.length ? rest : null,
          capture_id: captureRow.id,
          submitted_at: new Date().toISOString(),
          user_email: user?.email ?? null,
          status: 'saved',
        })
        .select('id')
        .single()
      if (detailErr) throw detailErr

      const route = determineApprovalRoute([{ amount: amt }])

      const { data: report, error: reportErr } = await supabase
        .from('expense_reports')
        .insert({
          report_reference: reportName.trim(),
          brand: vendor?.org_name || null,
          business_purpose: reportDescription.trim(),
          total_amount: amt,
          expense_count: 1,
          approval_route: route.route,
          status: 'submitted',
          employee_email: user?.email ?? null,
          pr_id: pr?.id ?? null,
          po_id: po.id,
        })
        .select()
        .single()
      if (reportErr) throw reportErr

      await supabase.from('report_expenses').insert({ report_id: report.id, expense_id: detail.id })
      await createApprovalRecords(report.id, amt, supabase)

      onSubmitted(report)
    } catch (err) {
      setError(err.message || 'Could not submit this invoice. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Stage 1: a quick popup, not the full form ──
  if (stage === 1) {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(26, 26, 26, 0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: '#FFFFFF', borderRadius: '6px', padding: '24px', width: '100%', maxWidth: '440px' }}
        >
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F36', marginBottom: '4px' }}>
            Submit expense for this PO
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace', marginBottom: '16px' }}>
            {po.po_number} · pending {fmtAmt(pending)}
          </div>

          {stage1Error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#B91C1C' }}>
              {stage1Error}
            </div>
          )}

          <Field label="Invoice Amount" required>
            <AmountInput value={amount} onChange={setAmount} error={overPending} inputStyle={{ height: '40px', fontSize: '14px' }} />
            {overPending && (
              <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '4px' }}>
                Exceeds pending balance of {fmtAmt(pending)}.
              </div>
            )}
          </Field>
          <Field label="Invoice Number">
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Payment Method">
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              onClick={handleContinue}
              style={{ height: '40px', padding: '0 24px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, background: '#8C3225', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
            >
              Continue
            </button>
            <button
              onClick={onClose}
              style={{ height: '40px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Stage 2: full-screen takeover ──
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F4F5F7', zIndex: 250, overflowY: 'auto' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <span onClick={() => setStage(1)} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>← Back</span>
          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
          <span onClick={onClose} style={{ fontSize: '12px', color: '#9CA3AF', cursor: 'pointer' }}>Cancel</span>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A1F36', marginBottom: '4px' }}>New Expense Report</div>
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '20px' }}>
          <span style={{ fontFamily: 'monospace' }}>{po.po_number}</span>
          {pr?.pr_number ? ` · ${pr.pr_number}` : ''}
          {vendor?.org_name ? ` · ${vendor.org_name}` : ''}
          {` · this invoice ${fmtAmt(amt)} of ${fmtAmt(pending)} pending`}
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#B91C1C' }}>
            {error}
          </div>
        )}

        <SectionCard title="From the Purchase Request" sub="Pre-filled — edit if this invoice differs">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Field label="Entity">
              <input value={entity} onChange={e => setEntity(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Program">
              <input value={program} onChange={e => setProgram(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Subprogram">
              <input value={subprogram} onChange={e => setSubprogram(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Donor">
              <input value={donor} onChange={e => setDonor(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                <option value="">Select category…</option>
                {PR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Expense Nature">
              <select value={expenseNature} onChange={e => setExpenseNature(e.target.value)} style={inputStyle}>
                <option value="">Select nature…</option>
                {EXPENSE_NATURES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Purpose / Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={textareaStyle} />
          </Field>
          <Field label="Vendor GSTIN">
            <input value={gstin} onChange={e => setGstin(e.target.value)} style={inputStyle} />
          </Field>
        </SectionCard>

        <SectionCard title="Attachments" sub="Invoice, receipt, quotation — whatever supports this payment">
          {attachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
              <select
                value={a.label}
                onChange={e => updateAttachment(i, { label: e.target.value })}
                style={{ ...inputStyle, width: '140px', flexShrink: 0 }}
              >
                {ATTACHMENT_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <div style={{ flex: 1 }}>
                <AttachmentDropzone accept="image/*,.pdf" file={a.file} onChange={f => updateAttachment(i, { file: f })} />
              </div>
              {i > 0 && (
                <button
                  onClick={() => removeAttachment(i)}
                  title="Remove"
                  style={{ height: '38px', width: '34px', flexShrink: 0, background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '4px', fontSize: '15px', cursor: 'pointer' }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {attachments.length === 1 && <div style={{ fontSize: '11px', color: '#DC2626', marginBottom: '10px' }}>* First attachment (Invoice) is required</div>}
          <button
            type="button"
            onClick={addAttachment}
            style={{ height: '32px', padding: '0 14px', background: '#FFFFFF', color: '#8C3225', border: '1px solid #8C3225', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Add another attachment
          </button>
        </SectionCard>

        <SectionCard title="Report Details" sub="Before you submit">
          <Field label="Report Name" required>
            <input value={reportName} onChange={e => setReportName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Description" required>
            <textarea
              value={reportDescription}
              onChange={e => setReportDescription(e.target.value)}
              rows={2}
              placeholder="A short line on what this report covers, e.g. 'Tranche 2 of 4 for venue booking'"
              style={textareaStyle}
            />
          </Field>
        </SectionCard>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              height: '42px', padding: '0 28px', borderRadius: '4px', fontSize: '13px', fontWeight: 600,
              background: saving ? '#9CA3AF' : '#8C3225', color: '#FFFFFF', border: 'none',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </button>
          <button
            onClick={() => setStage(1)}
            style={{ height: '42px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
