import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCSV } from '../../lib/exportUtils'
import { activityToRows, downloadActivityLogPDF, entityLabel, actionLabel, changeText } from '../../lib/activityLogExport'

const PAGE = 100
const EXPORT_LIMIT = 5000
const ENTITY_TYPES = ['pr', 'po', 'report', 'vendor', 'delegation']

function fmtDateTime(d) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const controlStyle = {
  height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 10px',
  fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
}

// Admin-only, append-only timeline of status changes, approval decisions and
// submissions (see src/lib/activityLog.js). Distinct from components/audit/
// AuditTrail.jsx, which is the per-PO document chain viewer.
export default function ActivityLog({ user }) {
  const isAdmin = user?.role === 'admin'
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [entityType, setEntityType] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(null) // 'csv' | 'pdf' | null
  const [error, setError] = useState(null)

  const buildQuery = useCallback(() => {
    let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false })
    if (entityType) q = q.eq('entity_type', entityType)
    if (from) q = q.gte('created_at', new Date(`${from}T00:00:00`).toISOString())
    if (to) q = q.lte('created_at', new Date(`${to}T23:59:59.999`).toISOString())
    const s = search.trim().replace(/[,()%]/g, ' ')
    if (s) q = q.or(`entity_ref.ilike.%${s}%,actor_name.ilike.%${s}%,actor_email.ilike.%${s}%,on_behalf_of.ilike.%${s}%`)
    return q
  }, [entityType, from, to, search])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await buildQuery().range(0, PAGE - 1)
    if (err) { setError(err.message); setLoading(false); return }
    setEntries(data || [])
    setHasMore((data || []).length === PAGE)
    setLoading(false)
  }, [buildQuery])

  // Debounce so typing in the search box doesn't fire a query per keystroke.
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
    if (entityType) parts.push(entityLabel(entityType))
    if (from || to) parts.push(`${from || 'start'} to ${to || 'today'}`)
    if (search.trim()) parts.push(`matching "${search.trim()}"`)
    return parts.length ? parts.join(' · ') : 'All activity'
  }

  async function handleExport(kind) {
    setExporting(kind); setError(null)
    const { data, error: err } = await buildQuery().limit(EXPORT_LIMIT)
    if (err || !data) { setError(err?.message || 'Could not prepare the export.'); setExporting(null); return }
    const stamp = new Date().toISOString().slice(0, 10)
    if (data.length === 0) { setError('Nothing to export for these filters.'); setExporting(null); return }
    if (kind === 'csv') downloadCSV(activityToRows(data), `nudge-activity-log-${stamp}.csv`)
    else await downloadActivityLogPDF(data, filterSummary(), `nudge-activity-log-${stamp}.pdf`)
    setExporting(null)
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
        The activity log is available to admins only.
      </div>
    )
  }

  const btn = {
    height: '34px', padding: '0 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600,
    border: '1px solid var(--action)', background: 'var(--surface-card)', color: 'var(--action)', cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--taupe-200)', padding: '0 28px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '14px 0' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Activity Log</h1>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Every status change, approval decision and submission — who did it, when, and for whom.
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 28px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
          <select value={entityType} onChange={e => setEntityType(e.target.value)} style={controlStyle}>
            <option value="">All records</option>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{entityLabel(t)}</option>)}
          </select>
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reference or person…"
            style={{ ...controlStyle, flex: 1, minWidth: '200px', maxWidth: '300px' }}
          />
          <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={controlStyle} aria-label="From date" />
          <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={controlStyle} aria-label="To date" />
          <div style={{ flex: 1 }} />
          <button onClick={() => handleExport('csv')} disabled={!!exporting} style={btn}>{exporting === 'csv' ? 'Preparing…' : 'Download CSV'}</button>
          <button onClick={() => handleExport('pdf')} disabled={!!exporting} style={btn}>{exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        </div>

        {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '12px' }}>{error}</div>}

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
            <thead>
              <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                {['When', 'Record', 'Action', 'Change', 'Done by', 'Note'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>No activity matches these filters yet.</td></tr>
              ) : entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--taupe-100)', verticalAlign: 'top' }}>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDateTime(e.created_at)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{entityLabel(e.entity_type)}</div>
                    <div style={{ fontFamily: 'monospace' }}>{e.entity_ref || e.entity_id}</div>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)', fontWeight: 600 }}>{actionLabel(e.action)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)' }}>{changeText(e) || '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)' }}>
                    <div>{e.actor_name || e.actor_email || '—'}</div>
                    {e.on_behalf_of && <div style={{ fontSize: '11px', color: 'var(--gold-text)' }}>on behalf of {e.on_behalf_of}</div>}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', maxWidth: '260px' }}>{e.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <button onClick={loadMore} style={btn}>Load more</button>
          </div>
        )}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>
          History starts from when logging was switched on; earlier activity isn&apos;t backfilled.
        </div>
      </div>
    </div>
  )
}
