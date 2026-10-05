import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { getDisplayName } from '../../lib/directory'
import { downloadCSV } from '../../lib/exportUtils'

const KIND = {
  violation: { label: 'Rule violation', color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
  flag:      { label: 'Flag',           color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  ai:        { label: 'AI audit',       color: 'var(--action)',    bg: 'var(--action-bg)' },
}

const prettyRule = r => String(r || 'other').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
const fmtAmt = n => '₹' + Number(n || 0).toLocaleString('en-IN')
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

const controlStyle = {
  height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 10px',
  fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ flex: 1, minWidth: '150px', background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color: tone || 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

// Org-wide roll-up of policy findings. Two sources, both only populated going
// forward (nothing is backfilled): the rule engine's per-expense result, saved
// when a report is submitted (expense_details.policy_flags), and the AI vouch
// verdict, saved when Finance runs the check (expense_reports.ai_vouch_*).
export default function PolicyViolationsView({ onViewReport }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [kindFilter, setKindFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: exps, error: e1 }, { data: ai, error: e2 }] = await Promise.all([
        supabase
          .from('expense_details')
          .select('id, vendor, category, amount, date, policy_flags, report_expenses(expense_reports(id, report_reference, status, brand, employee_email, created_at))')
          .not('policy_flags', 'is', null)
          .limit(2000),
        supabase
          .from('expense_reports')
          .select('id, report_reference, status, brand, employee_email, total_amount, created_at, ai_vouch_verdict, ai_vouch_confidence, ai_vouch_summary, ai_vouch_checked_at')
          .in('ai_vouch_verdict', ['flag', 'query'])
          .order('ai_vouch_checked_at', { ascending: false })
          .limit(1000),
      ])
      if (cancelled) return
      if (e1 || e2) { setError((e1 || e2).message); setLoading(false); return }

      const out = []
      for (const ex of exps || []) {
        const rep = ex.report_expenses?.[0]?.expense_reports
        for (const f of ex.policy_flags || []) {
          out.push({
            key: `${ex.id}-${f.rule}-${f.kind}`,
            kind: f.kind === 'violation' ? 'violation' : 'flag',
            rule: prettyRule(f.rule),
            detail: f.message || '',
            reportId: rep?.id, reportRef: rep?.report_reference, entity: rep?.brand || '',
            employee: rep?.employee_email || '', date: rep?.created_at,
            vendor: ex.vendor || '', amount: ex.amount, category: ex.category || '',
          })
        }
      }
      for (const r of ai || []) {
        out.push({
          key: `ai-${r.id}`, kind: 'ai',
          rule: `AI audit: ${r.ai_vouch_verdict}${r.ai_vouch_confidence ? ` (${r.ai_vouch_confidence} confidence)` : ''}`,
          detail: r.ai_vouch_summary || '',
          reportId: r.id, reportRef: r.report_reference, entity: r.brand || '',
          employee: r.employee_email || '', date: r.ai_vouch_checked_at || r.created_at,
          vendor: '', amount: r.total_amount, category: '',
        })
      }
      out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      setRows(out)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const entities = useMemo(() => [...new Set(rows.map(r => r.entity).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false
      if (entityFilter !== 'all' && r.entity !== entityFilter) return false
      if (!q) return true
      return [r.rule, r.detail, r.reportRef, r.employee, getDisplayName(r.employee), r.vendor, r.category]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [rows, kindFilter, entityFilter, search])

  const counts = useMemo(() => {
    const byRule = {}
    filtered.forEach(r => { byRule[r.rule] = (byRule[r.rule] || 0) + 1 })
    return {
      violations: filtered.filter(r => r.kind === 'violation').length,
      flags: filtered.filter(r => r.kind === 'flag').length,
      ai: filtered.filter(r => r.kind === 'ai').length,
      people: new Set(filtered.map(r => r.employee).filter(Boolean)).size,
      topRules: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 6),
    }
  }, [filtered])

  function handleExport() {
    if (!filtered.length) return
    downloadCSV(filtered.map(r => ({
      Type: KIND[r.kind].label, Finding: r.rule, Detail: r.detail, Report: r.reportRef || '',
      Employee: getDisplayName(r.employee) || r.employee, 'Employee Email': r.employee,
      Entity: r.entity, Vendor: r.vendor, Category: r.category, Amount: r.amount ?? '', Date: fmtDate(r.date),
    })), `nudge-policy-violations-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
  if (error) return <div style={{ fontSize: '13px', color: 'var(--clay-text)', padding: '24px 0' }}>Could not load policy findings: {error}</div>

  const maxRule = counts.topRules[0]?.[1] || 1

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <Stat label="Rule violations" value={counts.violations} tone={counts.violations ? 'var(--clay-text)' : undefined} />
        <Stat label="Flags to review" value={counts.flags} tone={counts.flags ? 'var(--gold-text)' : undefined} />
        <Stat label="AI audit flags" value={counts.ai} />
        <Stat label="People involved" value={counts.people} />
      </div>

      {counts.topRules.length > 0 && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '16px 18px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>Most common findings</div>
          {counts.topRules.map(([rule, n]) => (
            <div key={rule} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px', fontSize: '12px' }}>
              <div style={{ width: '220px', color: 'var(--ink)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule}</div>
              <div style={{ flex: 1, height: '8px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ width: `${(n / maxRule) * 100}%`, height: '100%', background: 'var(--action)', borderRadius: 'var(--radius-sm)' }} />
              </div>
              <div style={{ width: '28px', textAlign: 'right', color: 'var(--text-muted)' }}>{n}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
        <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} style={controlStyle}>
          <option value="all">All findings</option>
          <option value="violation">Rule violations</option>
          <option value="flag">Flags</option>
          <option value="ai">AI audit</option>
        </select>
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={controlStyle}>
          <option value="all">All entities</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search finding, report, person, vendor…" style={{ ...controlStyle, flex: 1, minWidth: '200px', maxWidth: '320px' }} />
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} disabled={!filtered.length} style={{ ...controlStyle, padding: '0 14px', fontWeight: 600, color: 'var(--action)', borderColor: 'var(--action)', cursor: filtered.length ? 'pointer' : 'default' }}>
          Download CSV
        </button>
      </div>

      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
          <thead>
            <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
              {['Type', 'Finding', 'Report', 'Employee', 'Expense', 'Date'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {rows.length === 0
                    ? 'No findings recorded yet. This fills in as reports are submitted and as Finance runs the AI audit on reports — earlier reports aren’t backfilled.'
                    : 'Nothing matches these filters.'}
                </td>
              </tr>
            ) : filtered.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--taupe-100)', verticalAlign: 'top' }}>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-sm)', color: KIND[r.kind].color, background: KIND[r.kind].bg, whiteSpace: 'nowrap' }}>{KIND[r.kind].label}</span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)', maxWidth: '320px' }}>
                  <div style={{ fontWeight: 600 }}>{r.rule}</div>
                  {r.detail && <div style={{ color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>{r.detail}</div>}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                  {r.reportId ? (
                    <span onClick={() => onViewReport?.(r.reportId)} style={{ fontFamily: 'monospace', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}>{r.reportRef || 'Open'}</span>
                  ) : '—'}
                  {r.entity && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.entity}</div>}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)' }}>{getDisplayName(r.employee) || r.employee || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)' }}>
                  {r.amount != null ? fmtAmt(r.amount) : '—'}
                  {(r.vendor || r.category) && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{[r.vendor, r.category].filter(Boolean).join(' · ')}</div>}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
