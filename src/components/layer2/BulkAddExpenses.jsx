import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { extractReceiptData } from '../../lib/claude'
import { imageFileToJpegBase64, pdfPageToBase64 } from '../../lib/receiptImage'
import { toInputDate, fromInputDate } from '../../lib/dateFormat'
import AmountInput from '../shared/AmountInput'

const CATEGORIES = [
  'Travel Fare', 'Lodging and Boarding', 'Food', 'Bike Fare',
  'Consultant Fee', 'Professional Fee', 'Retainership / Consultancy',
  'Legal Fees', 'Courier', 'Service', 'Staff Welfare', 'Filing Fees',
  'Furniture and Fixtures', 'Housekeeping', 'Leasehold Improvements',
  'Medicine', 'Relocation Allowance', 'Repairs and Maintenance',
  'Subscription / Software', 'Learning and Development', 'Other',
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
]

function blankRow() {
  return {
    date: '', vendor: '', category: '', amount: '', reimbursable: true, payment_method: '',
    capture_id: null, preview: null, qualityFlag: false,
  }
}

// Zoho-style "Bulk Add Expenses" — a spreadsheet-row grid for logging several
// expenses at once, instead of going through the single-expense form each
// time. Saves straight to expense_details, same table/shape ExpenseDetails.jsx
// uses, just without the receipt/OCR/donor-classification fields — those stay
// editable afterwards via "Edit" in ExpenseSelector.
//
// Rows can also come from uploaded receipt photos instead of manual typing —
// each upload is OCR'd (extractReceiptData, same call QuickAddDropzone.jsx
// makes) and prepended as a pre-filled row, keeping every field editable
// since a handwritten or low-quality photo won't always extract cleanly.
export default function BulkAddExpenses({ user, onSaved, onBack }) {
  const [rows, setRows] = useState(Array.from({ length: 5 }, blankRow))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [processingText, setProcessingText] = useState('')
  const [uploadError, setUploadError] = useState(null)
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  function updateRow(i, patch) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows(prev => [...prev, blankRow()])
  }

  // Best-effort, non-blocking cleanup — a receipt uploaded during this batch
  // review and then removed before saving shouldn't linger as an orphaned
  // Storage file + expense_captures row.
  function cleanupCapture(captureId, path) {
    if (!captureId) return
    supabase.from('expense_captures').delete().eq('id', captureId).then(() => {})
    if (path) supabase.storage.from('expense-documents').remove([path]).then(() => {})
  }

  function removeRow(i) {
    setRows(prev => {
      const row = prev[i]
      if (row?.capture_id) cleanupCapture(row.capture_id, row.storagePath)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  // Processes each uploaded file in turn (never in parallel — mirrors every
  // other capture entry point's one-at-a-time pattern and avoids hammering
  // the OCR API for a large batch). A single file's failure never blocks
  // the rest of the batch — it's reported inline and skipped.
  async function processFiles(fileList) {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    setUploadError(null)
    setProcessing(true)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProcessingText(`Processing receipt ${i + 1} of ${files.length}…`)
      try {
        if (file.size > 10 * 1024 * 1024) {
          setUploadError(prev => (prev ? `${prev}; ` : '') + `${file.name} is too large (max 10MB)`)
          continue
        }
        const { base64, previewUrl } = file.type === 'application/pdf'
          ? await pdfPageToBase64(file)
          : await imageFileToJpegBase64(file)

        const extracted = await extractReceiptData(base64).catch(() => null)

        const path = `captures/${Date.now()}-receipt-${i}.jpg`
        const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob()
        const { error: uploadErr } = await supabase.storage.from('expense-documents').upload(path, blob)
        if (uploadErr) throw uploadErr

        const { data: captureRow } = await supabase.from('expense_captures').insert({
          receipt_storage_path: path,
          receipt_extracted_amount: extracted?.amount ?? null,
          receipt_extracted_vendor: extracted?.vendor ?? null,
          receipt_extracted_date: extracted?.date ?? null,
          single_document: false,
          status: 'captured',
        }).select('id').single()

        const qualityFlag = !extracted?.amount && !extracted?.vendor
        setRows(prev => [{
          date: toInputDate(extracted?.date) || '',
          vendor: extracted?.vendor || '',
          category: extracted?.category || '',
          amount: extracted?.amount != null ? String(extracted.amount) : '',
          reimbursable: true,
          payment_method: '',
          capture_id: captureRow?.id ?? null,
          storagePath: path,
          preview: previewUrl,
          qualityFlag,
        }, ...prev])
      } catch (err) {
        console.error('Bulk receipt upload error:', err)
        setUploadError(prev => (prev ? `${prev}; ` : '') + `Could not process ${file.name} — try again`)
      }
    }

    setProcessing(false)
    setProcessingText('')
  }

  const filledRows = rows.filter(r => r.date || r.vendor || r.category || r.amount)

  async function handleSave() {
    if (filledRows.length === 0) return
    setSaving(true)
    setError(null)

    const payload = filledRows.map(r => ({
      date: r.date ? fromInputDate(r.date) : null,
      vendor: r.vendor || null,
      category: r.category || null,
      amount: r.amount ? Number(r.amount) : null,
      payment_method: r.payment_method || null,
      reimbursable: r.reimbursable,
      expense_type: 'just_me',
      submitted_at: new Date().toISOString(),
      user_email: user?.email ?? null,
      status: 'saved',
      capture_id: r.capture_id || null,
    }))

    const { error: err } = await supabase.from('expense_details').insert(payload)
    if (err) {
      console.error('Bulk add error:', err)
      setError(`Save failed: ${err.message}`)
      setSaving(false)
      return
    }
    onSaved()
  }

  const inputStyle = {
    width: '100%', height: '38px', border: '1px solid #E5E7EB', borderRadius: '4px',
    padding: '0 10px', fontSize: '13px', color: '#1A1A1A', outline: 'none',
    boxSizing: 'border-box', background: '#FFFFFF', fontFamily: 'inherit',
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px 100px', width: '100%' }}>
      <div
        onClick={onBack}
        style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', textDecoration: 'underline', marginBottom: '20px' }}
      >
        ← Back
      </div>

      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Quick Add</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '20px' }}>
        Bulk add expenses
      </div>

      {/* Upload receipts — each one gets OCR'd and prepended as a pre-filled
          row above. Camera is one shot per tap (an OS constraint), so it
          stays visible for tapping again; gallery supports picking several
          files at once. */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={processing}
          style={{
            height: '40px', padding: '0 16px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 500,
            cursor: processing ? 'default' : 'pointer',
          }}
        >
          Take Photo
        </button>
        <button
          onClick={() => galleryRef.current?.click()}
          disabled={processing}
          style={{
            height: '40px', padding: '0 16px', background: '#FFFFFF', color: '#1A1A1A',
            border: '1px solid #8C3225', borderRadius: '4px', fontSize: '13px', fontWeight: 500,
            cursor: processing ? 'default' : 'pointer',
          }}
        >
          Upload from gallery
        </button>
        <input
          ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment" style={{ display: 'none' }}
          onChange={e => { processFiles(e.target.files); e.target.value = '' }}
        />
        <input
          ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          multiple style={{ display: 'none' }}
          onChange={e => { processFiles(e.target.files); e.target.value = '' }}
        />
        {processing && (
          <span style={{ fontSize: '12px', color: '#6B7280' }}>{processingText}</span>
        )}
      </div>

      {uploadError && (
        <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '16px' }}>{uploadError}</div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              {['', 'Date', 'Merchant', 'Category', 'Amount', 'Reimbursable', 'Payment Mode', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '8px', width: '48px' }}>
                  {r.preview && (
                    <a href={r.preview} target="_blank" rel="noopener noreferrer" title={r.qualityFlag ? "Couldn't read this clearly — please check the details" : 'View receipt'}>
                      <img src={r.preview} alt="Receipt" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '3px', border: r.qualityFlag ? '2px solid #CA8A04' : '1px solid #E5E7EB' }} />
                    </a>
                  )}
                </td>
                <td style={{ padding: '8px' }}>
                  <input type="date" value={r.date} onChange={e => updateRow(i, { date: e.target.value })} style={inputStyle} />
                </td>
                <td style={{ padding: '8px' }}>
                  <input type="text" value={r.vendor} onChange={e => updateRow(i, { vendor: e.target.value })} placeholder="Who was this paid to" style={inputStyle} />
                </td>
                <td style={{ padding: '8px' }}>
                  <select value={r.category} onChange={e => updateRow(i, { category: e.target.value })} style={{ ...inputStyle, paddingLeft: '8px' }}>
                    <option value="">Select</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px' }}>
                  <AmountInput value={r.amount} onChange={v => updateRow(i, { amount: v })} placeholder="0.00" inputStyle={{ height: inputStyle.height, fontSize: inputStyle.fontSize }} />
                </td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  <input type="checkbox" checked={r.reimbursable} onChange={e => updateRow(i, { reimbursable: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                </td>
                <td style={{ padding: '8px' }}>
                  <select value={r.payment_method} onChange={e => updateRow(i, { payment_method: e.target.value })} style={{ ...inputStyle, paddingLeft: '8px' }}>
                    <option value="">Select</option>
                    {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px' }}>
                  {rows.length > 1 && (
                    <span onClick={() => removeRow(i)} style={{ fontSize: '11px', color: '#B91C1C', cursor: 'pointer' }}>Remove</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        onClick={addRow}
        style={{ marginTop: '14px', fontSize: '13px', color: '#8C3225', cursor: 'pointer', fontWeight: 500 }}
      >
        + Add More Expenses
      </div>

      {error && (
        <div style={{ fontSize: '13px', color: '#DC2626', marginTop: '16px' }}>{error}</div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: '220px', right: 0, zIndex: 10 }}>
        <div style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', gap: '10px', maxWidth: '960px', margin: '0 auto' }}>
          <button
            onClick={handleSave}
            disabled={saving || filledRows.length === 0}
            style={{
              height: '44px', padding: '0 28px', borderRadius: '4px', fontSize: '14px', fontWeight: 600,
              background: saving || filledRows.length === 0 ? '#9CA3AF' : '#8C3225', color: '#FFFFFF', border: 'none',
              cursor: saving || filledRows.length === 0 ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : `Save ${filledRows.length || ''} expense${filledRows.length === 1 ? '' : 's'}`}
          </button>
          <button
            onClick={onBack}
            style={{ height: '44px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '14px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
