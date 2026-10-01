import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { extractInvoiceDetails } from '../../lib/claude'
import { imageFileToJpegBase64, pdfPageToBase64 } from '../../lib/receiptImage'
import { EXPENSE_NATURES } from '../../lib/donorData'
import { PR_CATEGORIES } from '../../lib/prConstants'
import AttachmentDropzone from '../shared/AttachmentDropzone'
import AmountInput from '../shared/AmountInput'
import VoiceInputButton from '../shared/VoiceInputButton'

const ATTACHMENT_LABELS = ['Invoice', 'Receipt', 'Quotation', 'Other']

// Payment method used to be a per-invoice choice here, but the org only
// ever pays vendors by bank transfer — removed the picker, this is the
// only value `expense_details.payment_method` ever needs to carry now.
const PO_PAYMENT_METHOD = 'Bank Transfer'

function fmtAmt(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
        {label}{required && <span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>}
      </div>
      {children}
    </div>
  )
}

function SectionCard({ title, sub, children }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '20px', marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{title}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>{sub}</div>}
      {!sub && <div style={{ marginBottom: '10px' }} />}
      {children}
    </div>
  )
}

const inputStyle = { width: '100%', height: '38px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }
const textareaStyle = { width: '100%', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: '13px', color: 'var(--ink)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }

// Two-stage tranche/invoice capture against an already-issued PO. Stage 1
// is a quick popup for the core invoice numbers; Stage 2 is a full-screen
// review that pre-fills everything already known from the approved
// Purchase Request (entity, program, subprogram, donor, category, expense
// nature, purpose) — editable, since one specific invoice can differ
// slightly from what was originally requested — plus attachments.
//
// This only *captures* the invoice as a saved expense_details row (same
// shape ExpenseDetails.jsx writes, same 'saved' pool the Unreported count
// and ExpenseSelector already read from) — it does not create or submit a
// report. That mirrors how PO-tranche invoices are meant to be handled:
// capture now, then separately bundle it into a report (any time, possibly
// alongside other expenses) via the normal "New Report" flow, where the
// report gets its date range/name and is submitted for approval on its
// own. Never touches the PR/PO's own status.
export default function SubmitPOExpense({ po, pr, vendor, user, pending, onClose, onSubmitted }) {
  const [stage, setStage] = useState(1)

  // Stage 1 — this invoice's core numbers. Invoice Number is never typed —
  // it's read straight off the attached invoice via OCR (see handleInvoiceFile).
  const [amount, setAmount] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceFile, setInvoiceFile] = useState(null)
  const [ocrExtracting, setOcrExtracting] = useState(false)
  const [ocrExtracted, setOcrExtracted] = useState(null)
  const [ocrNotice, setOcrNotice] = useState(null)
  const [paymentLabel, setPaymentLabel] = useState('')
  const [priorCount, setPriorCount] = useState(null)
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

  // Stage 2 — attachments (first row is the primary invoice document,
  // seeded from Stage 1's upload once we get there).
  const [attachments, setAttachments] = useState([{ label: 'Invoice', file: null }])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const amt = Number(amount)
  const overPending = amount !== '' && amt > pending
  const amountLeftAfter = amount !== '' && !overPending ? Math.max(0, pending - amt) : null

  // How many invoices have already been captured against this PO — powers
  // the "Suggested: Nth payment" placeholder so nobody has to count by hand.
  useEffect(() => {
    let cancelled = false
    async function loadCount() {
      const { count } = await supabase
        .from('expense_details')
        .select('id', { count: 'exact', head: true })
        .eq('po_number', po.po_number)
      if (!cancelled) setPriorCount(count || 0)
    }
    loadCount()
    return () => { cancelled = true }
  }, [po.po_number])

  async function handleInvoiceFile(file) {
    setInvoiceFile(file)
    setOcrExtracted(null)
    setOcrNotice(null)
    if (!file) return
    setOcrExtracting(true)
    try {
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)
      const extracted = await extractInvoiceDetails(base64)
      if (extracted && (extracted.invoice_number || extracted.total_amount != null)) {
        setOcrExtracted(extracted)
        if (extracted.invoice_number) setInvoiceNumber(extracted.invoice_number)
        if (extracted.total_amount != null && !amount) setAmount(String(extracted.total_amount))
      } else {
        setOcrNotice('Could not read this invoice automatically — no problem, just enter the amount yourself below; the invoice is still attached and counts as your record for this payment.')
      }
    } catch (err) {
      console.error('Invoice OCR failed:', err)
      setOcrNotice('Could not read this invoice automatically — no problem, just enter the amount yourself below; the invoice is still attached and counts as your record for this payment.')
    }
    setOcrExtracting(false)
  }

  function handleContinue() {
    if (!invoiceFile) { setStage1Error('Attach the invoice for this payment.'); return }
    if (!amount || amt <= 0) { setStage1Error('Enter an invoice amount.'); return }
    if (overPending) { setStage1Error(`Amount cannot exceed the pending PO balance of ${fmtAmt(pending)}.`); return }
    setStage1Error(null)
    setAttachments(prev => {
      const next = [...prev]
      next[0] = { label: 'Invoice', file: invoiceFile }
      return next
    })
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

  async function handleSave() {
    if (!amount || amt <= 0 || overPending) { setError('Check the invoice amount before saving.'); return }
    if (!attachments[0]?.file) { setError('Attach the invoice for this payment.'); return }

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

      // Same PO PDF "Download PO PDF" opens from PODetail.jsx — but that one
      // is a short-lived (1hr) signed URL meant for an immediate click, not
      // for storing. This copy needs to still resolve years from now from
      // inside a saved expense record, so it's signed with a long expiry.
      let poPdfLink = null
      if (po.pdf_storage_path) {
        const { data: signed } = await supabase.storage
          .from('po-pdfs')
          .createSignedUrl(po.pdf_storage_path, 60 * 60 * 24 * 365 * 10)
        poPdfLink = signed?.signedUrl || null
      }

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
          po_pdf_link: poPdfLink,
          payment_method: PO_PAYMENT_METHOD,
          po_number: po.po_number || null,
          po_payment_label: paymentLabel.trim() || null,
          supporting_attachments: rest.length ? rest : null,
          capture_id: captureRow.id,
          submitted_at: new Date().toISOString(),
          user_email: user?.email ?? null,
          status: 'saved',
        })
        .select()
        .single()
      if (detailErr) throw detailErr

      onSubmitted(detail)
    } catch (err) {
      setError(err.message || 'Could not save this invoice. Please try again.')
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
          style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' }}
        >
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
            Submit expense for this PO
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '16px' }}>
            {po.po_number} · pending {fmtAmt(pending)}
          </div>

          {stage1Error && (
            <div style={{ background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: 'var(--clay-text)' }}>
              {stage1Error}
            </div>
          )}

          <Field label="Invoice" required>
            <AttachmentDropzone accept="image/*,.pdf" file={invoiceFile} onChange={handleInvoiceFile} />
            {ocrExtracting && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Reading invoice…</div>
            )}
            {ocrNotice && (
              <div style={{ fontSize: '11px', color: 'var(--gold-text)', marginTop: '6px' }}>{ocrNotice}</div>
            )}
            {ocrExtracted && (
              <div style={{ background: 'var(--moss-bg)', border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginTop: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--moss-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                  Extracted from document
                </div>
                {[
                  ['Invoice No.', ocrExtracted.invoice_number],
                  ['Vendor', ocrExtracted.vendor_name],
                  ['Date', ocrExtracted.date],
                  ['Total Amount', ocrExtracted.total_amount != null ? fmtAmt(ocrExtracted.total_amount) : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ink)', padding: '2px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                  Double-check these against the document before saving.
                </div>
              </div>
            )}
          </Field>

          <Field label="Invoice Amount" required>
            <AmountInput value={amount} onChange={setAmount} error={overPending} inputStyle={{ height: '40px', fontSize: '14px' }} />
            {overPending && (
              <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '4px' }}>
                Exceeds pending balance of {fmtAmt(pending)}.
              </div>
            )}
            {amountLeftAfter != null && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                After this payment: {fmtAmt(amountLeftAfter)} will still be pending on this PO.
              </div>
            )}
          </Field>

          <Field label="Which payment is this? (optional)">
            <input
              value={paymentLabel}
              onChange={e => setPaymentLabel(e.target.value)}
              placeholder={priorCount != null ? `e.g. ${ordinal(priorCount + 1)} of 4 (Quarterly)` : 'e.g. 2nd of 4 (Quarterly)'}
              style={inputStyle}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              If this PO is being paid in installments (e.g. quarterly), describe which one this is —
              {priorCount != null && ` ${priorCount} payment${priorCount === 1 ? '' : 's'} already captured against this PO so far.`}
            </div>
          </Field>

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              onClick={handleContinue}
              style={{ height: '40px', padding: '0 24px', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, background: 'var(--action)', color: 'var(--surface-card)', border: 'none', cursor: 'pointer' }}
            >
              Continue
            </button>
            <button
              onClick={onClose}
              style={{ height: '40px', padding: '0 20px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}
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
    <div style={{ position: 'fixed', inset: 0, background: 'var(--taupe-50)', zIndex: 250, overflowY: 'auto' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <span onClick={() => setStage(1)} style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer' }}>← Back</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/</span>
          <span onClick={onClose} style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</span>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Capture Invoice</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          <span style={{ fontFamily: 'monospace' }}>{po.po_number}</span>
          {pr?.pr_number ? ` · ${pr.pr_number}` : ''}
          {vendor?.org_name ? ` · ${vendor.org_name}` : ''}
          {paymentLabel ? ` · ${paymentLabel}` : ''}
          {` · this invoice ${fmtAmt(amt)} of ${fmtAmt(pending)} pending`}
        </div>

        {error && (
          <div style={{ background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: 'var(--clay-text)' }}>
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
            <div style={{ position: 'relative' }}>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...textareaStyle, paddingRight: '40px' }} />
              <VoiceInputButton value={description} onChange={setDescription} />
            </div>
          </Field>
          <Field label="Vendor GSTIN">
            <input value={gstin} onChange={e => setGstin(e.target.value)} style={inputStyle} />
          </Field>
        </SectionCard>

        <SectionCard title="Attachments" sub="Invoice already attached — add a receipt, quotation, or anything else that supports this payment">
          {attachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
              <select
                value={a.label}
                onChange={e => updateAttachment(i, { label: e.target.value })}
                disabled={i === 0}
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
                  style={{ height: '38px', width: '34px', flexShrink: 0, background: 'var(--surface-card)', color: 'var(--clay-text)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', fontSize: '15px', cursor: 'pointer' }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addAttachment}
            style={{ height: '32px', padding: '0 14px', background: 'var(--surface-card)', color: 'var(--action)', border: '1px solid var(--action)', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Add another attachment
          </button>
        </SectionCard>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
          This saves the invoice — it won't be submitted for approval yet. Add it to a report
          (any time, on its own or alongside other expenses) from Home whenever you're ready.
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: '42px', padding: '0 28px', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600,
              background: saving ? 'var(--text-muted)' : 'var(--action)', color: 'var(--surface-card)', border: 'none',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save Invoice'}
          </button>
          <button
            onClick={() => setStage(1)}
            style={{ height: '42px', padding: '0 20px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
