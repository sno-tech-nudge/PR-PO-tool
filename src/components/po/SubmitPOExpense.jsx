import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { determineApprovalRoute } from '../../lib/policyEngine'
import { createApprovalRecords } from '../../lib/approvalEngine'
import AttachmentDropzone from '../shared/AttachmentDropzone'

function fmtAmt(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

function generateReference() {
  const year = new Date().getFullYear()
  return 'TNI' + year + Math.floor(1000 + Math.random() * 9000)
}

// A tranche/invoice submission against an already-issued PO. Deliberately not
// the full 4-layer capture flow (no OCR, no policy checks) — the PR/PO were
// already approved, so this just needs an amount + invoice on file before it
// enters the same report_approvals chain any other expense report uses.
export default function SubmitPOExpense({ po, pr, vendor, user, pending, onClose, onSubmitted }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const amt = Number(amount)
  const overPending = amount !== '' && amt > pending

  async function handleSubmit() {
    if (!amount || amt <= 0) { setError('Enter an invoice amount.'); return }
    if (overPending) { setError(`Amount cannot exceed the pending PO balance of ${fmtAmt(pending)}.`); return }
    if (!file) { setError('Attach the invoice for this payment.'); return }

    setSaving(true)
    setError(null)

    try {
      const path = `po-invoices/${po.po_number}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('expense-documents').upload(path, file)
      if (uploadErr) throw uploadErr

      const { data: captureRow, error: captureErr } = await supabase
        .from('expense_captures')
        .insert({ receipt_storage_path: path, single_document: true, status: 'captured' })
        .select('id')
        .single()
      if (captureErr) throw captureErr

      const { data: detail, error: detailErr } = await supabase
        .from('expense_details')
        .insert({
          amount: amt,
          vendor: vendor?.org_name || null,
          date: new Date().toISOString().slice(0, 10),
          category: pr?.category || null,
          expense_type: 'purchase_order_tranche',
          description: note.trim() || null,
          capture_id: captureRow.id,
          submitted_at: new Date().toISOString(),
          user_email: user?.email ?? null,
          status: 'saved',
        })
        .select('id')
        .single()
      if (detailErr) throw detailErr

      const route = determineApprovalRoute([{ amount: amt }])
      const reference = generateReference()

      const { data: report, error: reportErr } = await supabase
        .from('expense_reports')
        .insert({
          report_reference: reference,
          brand: vendor?.org_name || null,
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
        style={{ background: '#FFFFFF', borderRadius: '6px', padding: '24px', width: '100%', maxWidth: '460px' }}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F36', marginBottom: '4px' }}>
          Submit expense for this PO
        </div>
        <div style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace', marginBottom: '16px' }}>
          {po.po_number} · pending {fmtAmt(pending)}
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#B91C1C' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Invoice amount</div>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            style={{
              width: '100%', height: '40px', border: `1px solid ${overPending ? '#FECACA' : '#E3E8EF'}`,
              borderRadius: '4px', padding: '0 12px', fontSize: '14px', color: '#1A1F36',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {overPending && (
            <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '4px' }}>
              Exceeds pending balance of {fmtAmt(pending)}.
            </div>
          )}
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Invoice<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span></div>
          <AttachmentDropzone accept="image/*,.pdf" file={file} onChange={setFile} />
        </div>

        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Note (optional)</div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. tranche 2 of 4"
            style={{ width: '100%', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px 12px', fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              height: '40px', padding: '0 24px', borderRadius: '4px', fontSize: '13px', fontWeight: 600,
              background: saving ? '#9CA3AF' : '#8C3225', color: '#FFFFFF', border: 'none',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Submitting…' : 'Submit for Approval'}
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
