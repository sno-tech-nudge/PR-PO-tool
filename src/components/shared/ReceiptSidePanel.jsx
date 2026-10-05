import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const isPdf = path => /\.pdf($|\?)/i.test(path || '')

function DocView({ label, url, path }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--action)', textDecoration: 'underline' }}>Open in new tab</a>
      </div>
      {isPdf(path) ? (
        <iframe title={label} src={url} style={{ width: '100%', height: '70vh', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)' }} />
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={label} style={{ width: '100%', display: 'block', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)' }} />
        </a>
      )}
    </div>
  )
}

// The receipt (and payment proof) for the expense being filled in, shown in
// the empty space to the right of the form so details can be read straight off
// it while typing. Sticks to the top while the form scrolls. Renders nothing
// if the expense has no attached document.
export default function ReceiptSidePanel({ captureId, onVisibleChange }) {
  const [docs, setDocs] = useState(null) // null = loading, [] = none

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!captureId) { setDocs([]); return }
      const { data } = await supabase.from('expense_captures').select('receipt_storage_path, payment_storage_path').eq('id', captureId).maybeSingle()
      const out = []
      for (const [label, path] of [['Receipt', data?.receipt_storage_path], ['Payment proof', data?.payment_storage_path]]) {
        if (!path) continue
        const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(path, 3600)
        if (s?.signedUrl) out.push({ label, url: s.signedUrl, path })
      }
      if (!cancelled) setDocs(out)
    }
    load()
    return () => { cancelled = true }
  }, [captureId])

  const visible = !!docs && docs.length > 0
  useEffect(() => { onVisibleChange?.(visible) }, [visible, onVisibleChange])

  if (!visible) return null

  return (
    <aside style={{
      position: 'sticky', top: '20px', alignSelf: 'flex-start', flex: '0 1 420px', minWidth: '280px',
      maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: 'var(--surface-card)',
      border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '16px',
    }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Keep this open while you fill in the details.
      </div>
      {docs.map(d => <DocView key={d.path} {...d} />)}
    </aside>
  )
}
