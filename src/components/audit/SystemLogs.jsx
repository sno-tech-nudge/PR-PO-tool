import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCSV } from '../../lib/exportUtils'
import { getMaintenance, scheduleMaintenance, endMaintenance, maintenanceStatus } from '../../lib/systemLog'
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

// Maintenance mode. While a window is active everyone except admins sees a
// maintenance page; admins keep full access and can end it at any time. It can
// start now or at a set time, and end when an admin ends it or at a set time.
function MaintenanceCard({ onChanged }) {
  const [state, setState] = useState(null)
  const [reason, setReason] = useState('')
  const [startMode, setStartMode] = useState('now')
  const [endMode, setEndMode] = useState('manual')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [, setTick] = useState(0)

  useEffect(() => { getMaintenance().then(setState).catch(() => setState({ on: false })) }, [])
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30000); return () => clearInterval(t) }, [])

  async function change(fn) {
    setBusy(true); setError(null)
    try {
      await fn()
      setState(await getMaintenance())
      setReason(''); setStartAt(''); setEndAt(''); setStartMode('now'); setEndMode('manual')
      window.dispatchEvent(new Event('nudge-maintenance-change'))
      onChanged?.()
    } catch { setError('That could not be saved. Please try again.') }
    setBusy(false)
  }

  function schedule() {
    const start = startMode === 'later' && startAt ? new Date(startAt) : null
    const end = endMode === 'at' && endAt ? new Date(endAt) : null
    if (startMode === 'later' && (!start || start.getTime() <= Date.now())) { setError('Pick a start time in the future, or choose Now.'); return }
    if (endMode === 'at' && (!end || end.getTime() <= (start ? start.getTime() : Date.now()))) { setError('The end time must be after the start.'); return }
    change(() => scheduleMaintenance({ reason: reason.trim(), startAt: start, endAt: end }))
  }

  if (!state) return null
  const status = maintenanceStatus(state)
  const fmt = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const live = status === 'active'
  const pill = on => ({
    padding: '5px 12px', fontSize: '12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit',
    border: `1px solid ${on ? 'var(--action)' : 'var(--taupe-300)'}`, background: on ? 'var(--action)' : 'var(--surface-card)', color: on ? 'var(--surface-card)' : 'var(--ink)',
  })

  return (
    <div style={{
      background: live ? 'var(--gold-bg)' : 'var(--surface-card)', border: `1px solid ${live ? 'var(--gold-border)' : 'var(--taupe-200)'}`,
      borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: live ? 'var(--gold-text)' : 'var(--ink)' }}>
            Maintenance mode: {live ? 'ON' : status === 'scheduled' ? 'scheduled' : 'off'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.5 }}>
            {live && `On since ${fmt(state.scheduled_start)}${state.scheduled_end ? `, planned until ${fmt(state.scheduled_end)}` : ''}${state.set_by_name ? `. Set by ${state.set_by_name}` : ''}${state.reason ? `. ${state.reason}` : ''}. Everyone except admins sees a maintenance page. You can still use everything.`}
            {status === 'scheduled' && `From ${fmt(state.scheduled_start)}${state.scheduled_end ? ` until ${fmt(state.scheduled_end)}` : ''}${state.reason ? `. ${state.reason}` : ''}. People are told shortly before it starts.`}
            {status === 'off' && 'While it is on, everyone except admins sees a maintenance page. Admins keep full access and can end it at any time.'}
            {status === 'expired' && 'Its planned end time has passed. It is being switched off.'}
          </div>
        </div>
        {(live || status === 'scheduled') && (
          <button type="button" disabled={busy} onClick={() => change(() => endMaintenance())} style={{ ...btn, background: 'var(--action)', color: 'var(--surface-card)' }}>
            {busy ? 'Saving…' : live ? 'End maintenance' : 'Cancel scheduled maintenance'}
          </button>
        )}
      </div>

      {status === 'off' && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="What is the work? (optional, shown to people)" style={controlStyle} />
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '2px' }}>Starts</span>
              <button type="button" style={pill(startMode === 'now')} onClick={() => setStartMode('now')}>Now</button>
              <button type="button" style={pill(startMode === 'later')} onClick={() => setStartMode('later')}>At a set time</button>
              {startMode === 'later' && <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} style={controlStyle} aria-label="Start time" />}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '2px' }}>Ends</span>
              <button type="button" style={pill(endMode === 'manual')} onClick={() => setEndMode('manual')}>When I end it</button>
              <button type="button" style={pill(endMode === 'at')} onClick={() => setEndMode('at')}>At a set time</button>
              {endMode === 'at' && <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} style={controlStyle} aria-label="End time" />}
            </div>
            <button type="button" disabled={busy} onClick={schedule} style={btn}>
              {busy ? 'Saving…' : startMode === 'later' ? 'Schedule maintenance' : 'Start maintenance'}
            </button>
          </div>
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
