import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { generateExpenseAttachmentsPDF, downloadPDF } from '../../lib/expenseAttachmentsPdf'

// Primary receipt/payment-proof document, linked via expense_captures.
// Auto-loads as soon as it mounts (whoever's looking needs to see the
// actual receipt, not go looking for a "View documents" link first) — the
// signed URL fetch is still lazy in the sense that it only happens for
// expenses actually rendered on screen, just not gated behind an extra
// click on top of that.
export function ReceiptDocuments({ captureId }) {
  const [urls, setUrls] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('expense_captures').select('receipt_storage_path, payment_storage_path').eq('id', captureId).single()
      if (cancelled) return
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
      if (!cancelled) { setUrls(links); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [captureId])

  if (loading) return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>Loading receipt…</div>
  if (!urls?.receipt && !urls?.payment) return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>No documents found</div>

  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
      {urls.receipt && (
        <a href={urls.receipt} target="_blank" rel="noopener noreferrer">
          <img
            src={urls.receipt}
            alt="Receipt"
            style={{ maxWidth: '140px', maxHeight: '110px', objectFit: 'contain', border: '1px solid var(--taupe-200)', display: 'block', borderRadius: 'var(--radius-sm)' }}
          />
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Receipt</div>
        </a>
      )}
      {urls.payment && (
        <a href={urls.payment} target="_blank" rel="noopener noreferrer">
          <img
            src={urls.payment}
            alt="Payment proof"
            style={{ maxWidth: '140px', maxHeight: '110px', objectFit: 'contain', border: '1px solid var(--taupe-200)', display: 'block', borderRadius: 'var(--radius-sm)' }}
          />
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Payment proof</div>
        </a>
      )}
    </div>
  )
}

// Extra files beyond the primary receipt/payment proof (e.g. a
// multi-invoice PO expense) — plain storage paths on the expense row
// itself, same lazy-signed-URL pattern.
export function SupportingAttachments({ attachments }) {
  const [urls, setUrls] = useState(null)
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
      <div
        onClick={load}
        style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', marginBottom: '8px' }}
      >
        View other attachments ({attachments.length})
      </div>
    )
  }
  if (loading) return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>Loading…</div>

  return (
    <div style={{ marginBottom: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      {attachments.map((a, i) => (
        urls[a.path] ? (
          <a key={i} href={urls[a.path]} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--action)', textDecoration: 'underline' }}>
            View {a.label}
          </a>
        ) : (
          <span key={i} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.label} not found</span>
        )
      ))}
    </div>
  )
}

// PO Pdf link / VR PDF Link on the Zoho export point into the internal
// Zoho Creator app UI (creatorapp.zoho.com/.../tni-finance/#page:...) —
// viewable only by someone logged into Zoho Creator with access, a dead
// end for everyone else. Never surface those; the compiled report PDF
// (ER PDF Link, almost always a plain Google Drive link) is the one
// external link worth showing.
function isZohoCreatorLink(url) {
  return typeof url === 'string' && url.includes('creatorapp.zoho.com')
}

// Raw external links carried over from migrated/historical data — opened
// directly in a new tab exactly as given, rather than proxied through our
// own Storage. No signed-URL fetch needed since these already point
// straight at the source (Google Drive), and whoever clicks it uses their
// own session there to view it.
export function ExternalAttachmentLinks({ poLink, vrLink, erLink }) {
  const links = [
    poLink && !isZohoCreatorLink(poLink) && { url: poLink, label: 'View Attachment (PO)' },
    vrLink && !isZohoCreatorLink(vrLink) && { url: vrLink, label: 'View Attachment (VR)' },
    erLink && { url: erLink, label: 'View Attachment (Report)' },
  ].filter(Boolean)
  if (links.length === 0) return null

  // Only qualify the label when there's more than one to tell apart —
  // a single link just reads "View Attachment".
  return (
    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '8px' }}>
      {links.map((l, i) => (
        <a
          key={i}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '11px', color: 'var(--action)', textDecoration: 'underline' }}
        >
          {links.length > 1 ? l.label : 'View Attachment'}
        </a>
      ))}
    </div>
  )
}

// Merges the receipt, payment proof, and any supporting_attachments into
// one downloadable PDF instead of leaving them as separate images to
// view/save one at a time — reuses the same pdf-lib merge already built
// for vendor profile PDFs (src/lib/pdfMerge.js).
export function DownloadAttachmentsButton({ captureId, attachments }) {
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
    <div style={{ marginBottom: '8px' }}>
      <div
        onClick={busy ? undefined : handleDownload}
        style={{ fontSize: '11px', color: busy ? 'var(--text-muted)' : 'var(--action)', cursor: busy ? 'default' : 'pointer', textDecoration: 'underline', display: 'inline-block' }}
      >
        {busy ? (step || 'Preparing PDF…') : 'Download attachments (PDF)'}
      </div>
      {error && <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}
