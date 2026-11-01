import { useState } from 'react'
import { buildAuditPack } from '../../lib/auditPack'

const iso = d => d.toISOString().slice(0, 10)
const controlStyle = {
  height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 10px',
  fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
}

// One button that builds the whole audit pack for a date range: the reports,
// receipts, vouch history and the system logs for the same period, as one zip.
export default function AuditPack({ user }) {
  const today = new Date()
  const monthAgo = new Date(Date.now() - 30 * 86400000)
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(iso(monthAgo))
  const [to, setTo] = useState(iso(today))
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function run() {
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await buildAuditPack({ from, to, user, onProgress: setStep })
      if (!res.ok) setError(res.reason)
      else setResult(res)
    } catch (err) {
      console.error('Audit pack failed:', err)
      setError('Could not build the audit pack. Please try again, or pick a shorter period.')
    }
    setBusy(false); setStep('')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{ height: '34px', padding: '0 16px', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--action)', color: 'var(--surface-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Download audit pack
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '42px', zIndex: 20, width: '340px', maxWidth: '86vw', boxSizing: 'border-box',
          background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '16px',
          boxShadow: '0 8px 24px rgba(54, 32, 26, 0.18)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Audit pack</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
            Every report submitted in the period, with its receipts, vouch history and approval trail, plus the system logs for the same dates. One zip file.
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={{ ...controlStyle, flex: 1, minWidth: 0 }} aria-label="From date" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>to</span>
            <input type="date" value={to} min={from} max={iso(today)} onChange={e => setTo(e.target.value)} style={{ ...controlStyle, flex: 1, minWidth: 0 }} aria-label="To date" />
          </div>
          <button
            type="button" disabled={busy || !from || !to} onClick={run}
            style={{ width: '100%', height: '36px', border: 'none', borderRadius: 'var(--radius-sm)', background: busy ? 'var(--taupe-200)' : 'var(--ink)', color: busy ? 'var(--text-muted)' : 'var(--surface-card)', fontSize: '13px', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
          >
            {busy ? step || 'Working…' : 'Build and download'}
          </button>
          {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginTop: '10px', lineHeight: 1.5 }}>{error}</div>}
          {result && (
            <div style={{ fontSize: '12px', color: 'var(--moss-text)', marginTop: '10px', lineHeight: 1.5 }}>
              Done. {result.reports} report{result.reports === 1 ? '' : 's'}, {result.receipts} receipt file{result.receipts === 1 ? '' : 's'}, {result.logs} system log entr{result.logs === 1 ? 'y' : 'ies'}.
              {result.missing > 0 && ` ${result.missing} file${result.missing === 1 ? '' : 's'} could not be collected; the README lists them.`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
