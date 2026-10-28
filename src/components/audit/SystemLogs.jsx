import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCSV } from '../../lib/exportUtils'
import { getMaintenance, startMaintenance, endMaintenance } from '../../lib/systemLog'
import { CATEGORY_LABEL, categoryLabel, actionLabel, fmtStamp, whoText, systemLogRows, downloadSystemLogPDF } from '../../lib/systemLogExport'

const PAGE = 100
const EXPORT_LIMIT = 5000

const controlStyle = {
  height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 10px',
  fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
}
const btn = {
  height: '34px', padding: '0 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600,
  border: '1px solid var(--action)', background: 'var(--surface-card)', color: 'var(--action)', cursor: 'pointer', whiteSpace: 'nowrap',
}

// Maintenance mode: while it is on everyone sees a notice, and optionally
// everyone but admins is held back. Starting and ending it are recorded below.
function MaintenanceCard({ onChanged }) {
  const [state, setState] = useState(null)
  const [reason, setReason] = useState('')
  const [block, setBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { getMaintenance().then(setState).catch(() => setState({ on: false })) }, [])

  async function change(fn) {
    setBusy(true); setError(null)
    try {
      await fn()
      setState(await getMaintenance())
      setReason('')
      window.dispatchEvent(new Event('nudge-maintenance-change'))
      onChanged?.()
    } catch { setError('That could not be saved. Please try again.') }
    setBusy(false)
  }

  if (!state) return null
  return (
    <div style={{
      background: state.on ? 'var(--gold-bg)' : 'var(--surface-card)', border: `1px solid ${state.on ? 'var(--gold-border)' : 'var(--taupe-200)'}`,
      borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: state.on ? 'var(--gold-text)' : 'var(--ink)' }}>
            Maintenance mode: {state.on ? 'ON' : 'off'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.5 }}>
            {state.on
              ? `Since ${fmtStamp(state.started_at)} by ${state.started_by_name || state.started_by || 'an admin'}${state.reason ? `. ${state.reason}` : ''}${state.block ? ' Everyone except admins is held back.' : ' Everyone sees a notice.'}`
              : 'Turn it on before planned work. Everyone sees a notice, and the start and end are recorded here.'}
          </div>
        </div>
        {state.on && <button type="button" disabled={busy} onClick={() => change(endMaintenance)} style={{ ...btn, background: 'var(--action)', color: 'var(--surface-card)' }}>{busy ? 'Ending…' : 'End maintenance'}</button>}
      </div>
      {!state.on && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="What is the work? (optional)" style={{ ...controlStyle, flex: '1 1 260px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={block} onChange={e => setBlock(e.target.checked)} />
            Hold everyone except admins back
          </label>
          <button type="button" disabled={busy} onClick={() => change(() => startMaintenance({ reason: reason.trim(), block }))} style={btn}>{busy ? 'Starting…' : 'Start maintenance'}</button>
        </div>
      )}
      {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginTop: '8px' }}>{error}</div>}
    </div>
  )
}

// Long statements (a whole migration run in one go) are folded to a few lines until clicked.
function Detail({ text }) {
  const [open, setOpen] = useState(false)
  if (!text) return '—'
  if (text.length <= 180) return text
  return (
    <span>
      {open ? text : `${text.slice(0, 180)}…`}{' '}
      <span role="button" onClick={() => setOpen(o => !o)} style={{ color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}>{open ? 'less' : 'more'}</span>
    </span>
  )
}

// Admin-only, append-only record of changes to the system itself: database
// changes, people and roles added or changed, new versions of the app,
// maintenance windows, and CSV downloads. Nothing here can be edited or deleted.
export default function SystemLogs({ user }) {
  const isAdmin = user?.role === 'admin'
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(null)
  const [error, setError] = useState(null)

  const buildQuery = useCallback(() => {
    let q = supabase.from('system_logs').select('*').order('created_at', { ascending: false })
    if (category) q = q.eq('category', category)
    if (from) q = q.gte('created_at', new Date(`${from}T00:00:00`).toISOString())
    if (to) q = q.lte('created_at', new Date(`${to}T23:59:59.999`).toISOString())
    const s = search.trim().replace(/[,()%]/g, ' ')
    if (s) q = q.or(`target.ilike.%${s}%,detail.ilike.%${s}%,actor_name.ilike.%${s}%,actor_email.ilike.%${s}%`)
    return q
  }, [category, from, to, search])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await buildQuery().range(0, PAGE - 1)
    if (err) { setError(err.message); setLoading(false); return }
    setEntries(data || [])
    setHasMore((data || []).length === PAGE)
    setLoading(false)
  }, [buildQuery])

  useEffect(() => {
    if (!isAdmin) return
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [isAdmin, load])

  async function loadMore() {
    const { data } = await buildQuery().range(entries.length, entries.length + PAGE - 1)
    setEntries(prev => [...prev, ...(data || [])])
    setHasMore((data || []).length === PAGE)
  }

  function filterSummary() {
    const parts = []
    if (category) parts.push(categoryLabel(category))
    if (from || to) parts.push(`${from || 'start'} to ${to || 'today'}`)
    if (search.trim()) parts.push(`matching "${search.trim()}"`)
    return parts.length ? parts.join(' · ') : 'Everything'
  }

  async function handleExport(kind) {
    setExporting(kind); setError(null)
    const { data, error: err } = await buildQuery().limit(EXPORT_LIMIT)
    if (err || !data) { setError(err?.message || 'Could not prepare the export.'); setExporting(null); return }
    if (data.length === 0) { setError('Nothing to export for these filters.'); setExporting(null); return }
    const stamp = new Date().toISOString().slice(0, 10)
    if (kind === 'csv') downloadCSV(systemLogRows(data), `nudge-system-logs-${stamp}.csv`)
    else await downloadSystemLogPDF(data, filterSummary(), `nudge-system-logs-${stamp}.pdf`)
    setExporting(null)
    load() // the download itself is now in the log
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
        System logs are available to admins only.
      </div>
    )
  }

  const tone = c => (c === 'maintenance' ? 'var(--gold-text)' : c === 'schema' ? 'var(--clay-text)' : c === 'team' ? 'var(--action)' : c === 'download' ? 'var(--text-muted)' : 'var(--moss-text)')

  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--taupe-200)', padding: '0 28px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '14px 0' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>System Logs</h1>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Changes to the system itself: database changes, people and roles, new versions, maintenance and CSV downloads. Nobody can edit or delete these entries.
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 28px' }}>
        <MaintenanceCard onChanged={load} />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
          <select value={category} onChange={e => setCategory(e.target.value)} style={controlStyle}>
            <option value="">All events</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a name, file or detail…" style={{ ...controlStyle, flex: 1, minWidth: '200px', maxWidth: '300px' }} />
          <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={controlStyle} aria-label="From date" />
          <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={controlStyle} aria-label="To date" />
          <div style={{ flex: 1 }} />
          <button onClick={() => handleExport('csv')} disabled={!!exporting} style={btn}>{exporting === 'csv' ? 'Preparing…' : 'Download CSV'}</button>
          <button onClick={() => handleExport('pdf')} disabled={!!exporting} style={btn}>{exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        </div>

        {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '12px' }}>{error}</div>}

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                {['Date and time', 'Event', 'Target', 'Detail', 'Done by'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Nothing recorded for these filters yet.</td></tr>
              ) : entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--taupe-100)', verticalAlign: 'top' }}>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtStamp(e.created_at)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: tone(e.category) }}>{categoryLabel(e.category)}</div>
                    <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{actionLabel(e.action)}</div>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '200px' }}>{e.target || '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', maxWidth: '320px', wordBreak: 'break-word', lineHeight: 1.5 }}><Detail text={e.detail} /></td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)' }}>
                    <div>{whoText(e)}</div>
                    {e.source === 'database' && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>recorded by the database</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <div style={{ textAlign: 'center', marginTop: '14px' }}><button onClick={loadMore} style={btn}>Load more</button></div>
        )}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
          History starts from when system logging was switched on. Database changes and role changes are recorded by the database itself, so changes made outside the app are included.
        </div>
      </div>
    </div>
  )
}
