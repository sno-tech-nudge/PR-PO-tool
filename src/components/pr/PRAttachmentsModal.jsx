import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Consolidated attachments viewer for a PR — Quotation 1..N, the Single
// Source Justification note, and the Comparative Statement, in one popup
// instead of scattered per-quote links. Fetches its own signed URLs so
// callers just pass the PR record.
export default function PRAttachmentsModal({ pr, onClose }) {
  const [urls, setUrls] = useState({})
  const [comparativeUrl, setComparativeUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const paths = pr.quotes?.length
        ? pr.quotes.map(q => q.quote_path).filter(Boolean)
        : (pr.quote_paths || [])
      const entries = await Promise.all(paths.map(async p => {
        const { data } = await supabase.storage.from('pr-quotes').createSignedUrl(p, 3600)
        return [p, data?.signedUrl]
      }))
      if (cancelled) return
      setUrls(Object.fromEntries(entries))
      if (pr.comparative_statement_path) {
        const { data } = await supabase.storage.from('pr-quotes').createSignedUrl(pr.comparative_statement_path, 3600)
        if (!cancelled) setComparativeUrl(data?.signedUrl)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [pr])

  const quotes = pr.quotes?.length
    ? pr.quotes
    : (pr.quote_paths || []).map(p => ({ quote_path: p }))

  const nothingToShow = quotes.length === 0 && !pr.single_source_justification && !pr.comparative_statement_path

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26, 26, 26, 0.5)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#FFFFFF', borderRadius: '6px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F36', marginBottom: '4px' }}>
          Attachments
        </div>
        <div style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace', marginBottom: '18px' }}>{pr.pr_number}</div>

        {loading ? (
          <div style={{ fontSize: '13px', color: '#9CA3AF', padding: '12px 0' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {quotes.map((q, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px 14px' }}>
                <div style={{ fontSize: '13px', color: '#374151' }}>
                  <span style={{ fontWeight: 600 }}>Quotation {i + 1}</span>
                  {q.vendor_name ? ` — ${q.vendor_name}` : ''}
                  {q.amount ? ` · ₹${Number(q.amount).toLocaleString('en-IN')}` : ''}
                  {q.selected && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, color: '#15803D' }}>SELECTED</span>}
                </div>
                {urls[q.quote_path] ? (
                  <a href={urls[q.quote_path]} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline', flexShrink: 0, marginLeft: '12px' }}>
                    View
                  </a>
                ) : (
                  <span style={{ fontSize: '12px', color: '#9CA3AF', flexShrink: 0, marginLeft: '12px' }}>Not attached</span>
                )}
              </div>
            ))}

            {pr.single_source_justification && (
              <div style={{ border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px 14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Justification Note</div>
                <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap' }}>{pr.single_source_justification}</div>
              </div>
            )}

            {pr.comparative_statement_path && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px 14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Comparative Statement</div>
                {comparativeUrl ? (
                  <a href={comparativeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline', flexShrink: 0, marginLeft: '12px' }}>
                    View
                  </a>
                ) : (
                  <span style={{ fontSize: '12px', color: '#9CA3AF', flexShrink: 0, marginLeft: '12px' }}>Not attached</span>
                )}
              </div>
            )}

            {nothingToShow && (
              <div style={{ fontSize: '13px', color: '#9CA3AF', padding: '12px 0' }}>No attachments on this request.</div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          style={{ marginTop: '18px', height: '38px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
