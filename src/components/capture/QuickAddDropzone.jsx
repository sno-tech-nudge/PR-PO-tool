import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { extractReceiptData } from '../../lib/claude'
import { imageFileToJpegBase64, pdfPageToBase64 } from '../../lib/receiptImage'

// "Quick Add" home-screen dropzone — drop or pick a receipt, it gets OCR'd
// and uploaded immediately, then hands straight to ExpenseDetails prefilled.
// Deliberately skips the full NewExpense wizard (photo/payment-proof/cross-
// validation steps) — this is the fast path for someone who already has a
// receipt file in hand. Fields Groq isn't confident about come back null
// (see extractReceiptData's prompt) and are just left blank for the person
// to fill in on the next screen.
export default function QuickAddDropzone({ onReady }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyText, setBusyText] = useState('')
  const [error, setError] = useState(null)

  async function handleFile(file) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('This file is too large. Please use a file under 10MB.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      setBusyText('Reading receipt…')
      const { base64 } = file.type === 'application/pdf'
        ? await pdfPageToBase64(file)
        : await imageFileToJpegBase64(file)

      const extracted = await extractReceiptData(base64).catch(() => null)

      setBusyText('Uploading…')
      const path = `captures/${Date.now()}-receipt.jpg`
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

      onReady({
        amount: extracted?.amount ?? null,
        vendor: extracted?.vendor ?? null,
        date: extracted?.date ?? null,
        category: extracted?.category ?? null,
        invoice_number: extracted?.invoice_number ?? null,
        gstin: extracted?.gstin ?? null,
        payment_method: null,
        is_upi: false,
        single_document: false,
        capture_id: captureRow?.id ?? null,
      })
    } catch (err) {
      setError('Could not process this file. Please try again or use "New Expense" instead.')
      console.error('Quick add receipt error:', err)
    }
    setBusy(false)
  }

  return (
    <div
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false)
        handleFile(e.dataTransfer.files?.[0])
      }}
      style={{
        border: `1.5px dashed ${dragOver ? '#8C3225' : '#D1D5DB'}`,
        borderRadius: '10px', padding: '28px 20px', textAlign: 'center',
        cursor: busy ? 'default' : 'pointer', background: dragOver ? '#fdf0ed' : '#FAFAFA',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '148px', boxSizing: 'border-box',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {busy ? (
        <>
          <div className="spinner" style={{ marginBottom: '10px' }} />
          <div style={{ fontSize: '13px', color: '#6B7280' }}>{busyText}</div>
        </>
      ) : (
        <>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%', background: '#8C3225',
            color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', marginBottom: '10px',
          }}>
            ↑
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1A1F36', marginBottom: '4px' }}>
            Drag Receipts
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>
            or <span style={{ color: '#8C3225', fontWeight: 600 }}>click here</span> to attach
          </div>
        </>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '10px' }}>{error}</div>
      )}
    </div>
  )
}
