import { useState } from 'react'
import { extractVendorQuote } from '../../lib/claude'
import { supabase } from '../../lib/supabase'
import { imageFileToJpegBase64, pdfPageToBase64 } from '../../lib/receiptImage'
import AttachmentDropzone from '../shared/AttachmentDropzone'

// Route through the same JPEG-normalizing, downscaling converters the
// receipt-capture flow uses — a raw FileReader dataURL used to send whatever
// format/resolution the file happened to be (including full-res phone
// photos, or a PDF's raw bytes mislabeled as image/jpeg) straight to Gemini,
// which was slow and, for PDFs, often simply unreadable.
async function fileToJpegBase64(file) {
  const { base64 } = file.type === 'application/pdf'
    ? await pdfPageToBase64(file)
    : await imageFileToJpegBase64(file)
  return base64
}

export default function QuoteUpload({ onExtracted, onFileUploaded, skipExtraction }) {
  const [file, setFile]         = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted]   = useState(null)
  // `notice` is the benign "couldn't auto-read, fill manually" case — kept
  // separate from `error` (a real failure, e.g. the upload itself failing)
  // so it doesn't render like something blocking the submission.
  const [notice, setNotice]         = useState(null)
  const [error, setError]           = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [uploaded, setUploaded]     = useState(false)

  async function handleFile(f) {
    if (!f) return
    setFile(f)
    setExtracted(null)
    setNotice(null)
    setError(null)
    // Comparative statements etc. aren't single-vendor quotes — skip the AI extraction call.
    if (skipExtraction) return
    setExtracting(true)
    // Extraction is a best-effort convenience, never a gate — if it fails for
    // any reason (model overloaded, unreadable image, network hiccup), the
    // requester still fills the fields manually and attaches the document
    // itself via the "Upload to system" button below, which is all
    // quotesValidity() actually checks before allowing submission.
    try {
      const b64 = await fileToJpegBase64(f)
      const result = await extractVendorQuote(b64)
      if (result) {
        setExtracted(result)
        onExtracted(result)
      } else {
        setNotice('Could not read this document automatically — no problem, just fill in the vendor name and amount yourself and upload it below; that still counts as your attached quote.')
      }
    } catch {
      setNotice('Could not read this document automatically — no problem, just fill in the vendor name and amount yourself and upload it below; that still counts as your attached quote.')
    } finally {
      setExtracting(false)
    }
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `quotes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('pr-quotes').upload(path, file)
      if (uploadErr) {
        if (uploadErr.message?.toLowerCase().includes('not found') || uploadErr.statusCode === 404 || uploadErr.error === 'Bucket not found') {
          throw new Error('Storage bucket "pr-quotes" has not been created yet. Run the SQL in supabase_migration_vendors_bucket.sql in your Supabase SQL Editor, then retry.')
        }
        throw uploadErr
      }
      onFileUploaded(path)
      setUploaded(true)
    } catch (err) {
      setError('Upload failed: ' + err.message)
    }
    setUploading(false)
  }

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <AttachmentDropzone accept="image/*,.pdf" file={file} onChange={handleFile} />
      </div>

      {extracting && (
        <div style={{ background: '#fdf0ed', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '12px 14px', fontSize: '13px', color: '#1E40AF' }}>
          Extracting data from document…
        </div>
      )}

      {notice && (
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '10px 14px', fontSize: '12px', color: '#4B5563', marginBottom: '8px' }}>
          {notice}
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '10px 14px', fontSize: '12px', color: '#B91C1C', marginBottom: '8px' }}>
          {error}
        </div>
      )}

      {extracted && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '4px', padding: '14px', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Extracted from document</div>
          <div style={{ fontSize: '11px', color: '#4B5563', marginBottom: '10px', lineHeight: 1.5 }}>
            ⚠ Auto-filled from the document — double check the fields below against it before submitting.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              ['Vendor', extracted.vendor_name],
              ['Quote No.', extracted.quote_number],
              ['Date', extracted.date],
              ['Total Amount', extracted.total_amount != null ? `INR ${Number(extracted.total_amount).toLocaleString('en-IN')}` : null],
            ].map(([label, val]) => val ? (
              <div key={label}>
                <div style={{ fontSize: '10px', color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>{label}</div>
                <div style={{ fontSize: '13px', color: '#14532D', fontWeight: 500 }}>{val}</div>
              </div>
            ) : null)}
          </div>
          {extracted.line_items && extracted.line_items.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10px', color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Line Items</div>
              {extracted.line_items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#14532D', marginBottom: '2px' }}>
                  <span>{item.description}</span>
                  <span>{item.total != null ? `INR ${Number(item.total).toLocaleString('en-IN')}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {file && !uploading && !uploaded && (
        <button
          onClick={handleUpload}
          style={{ height: '34px', padding: '0 16px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
        >
          Upload to system
        </button>
      )}
      {uploading && <div style={{ fontSize: '12px', color: '#6B7280' }}>Uploading…</div>}
      {uploaded && <div style={{ fontSize: '12px', color: '#15803D', fontWeight: 500 }}>Uploaded successfully</div>}
    </div>
  )
}
