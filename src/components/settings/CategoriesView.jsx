import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { refreshCustomCategories } from '../../lib/categories'
import { OTHER_CATEGORY } from '../../lib/expenseCategories'

const DEFAULT_THRESHOLD = 5

const smallBtn = primary => ({
  height: '28px', padding: '0 12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--taupe-300)', background: primary ? 'var(--action)' : 'var(--surface-card)', color: primary ? 'var(--surface-card)' : 'var(--ink)',
})
const th = { fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 12px 8px 0', textAlign: 'left' }
const td = { fontSize: '13px', color: 'var(--ink)', padding: '8px 12px 8px 0', borderTop: '1px solid var(--taupe-200)' }

// A rough match so "Stage hires" and "stage hire" count as one (the database does the
// real counting; this only previews what is close to becoming a category).
const roughKey = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\band\b/g, ' ').replace(/\b(\w{3,})s\b/g, '$1').replace(/\s+/g, ' ').trim()
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// Categories that grew out of "Other". When the same thing is typed under Other often
// enough the database makes it a category by itself; here Finance sees what was made,
// what is close, and can hide one that should not be offered or change the threshold.
export default function CategoriesView({ user }) {
  const [cats, setCats] = useState(null)
  const [typed, setTyped] = useState(null)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_THRESHOLD))
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: rows }, { data: st }, { data: other }] = await Promise.all([
      supabase.from('custom_categories').select('*').order('created_at', { ascending: false }),
      supabase.from('system_state').select('value').eq('key', 'category_auto').maybeSingle(),
      supabase.from('expense_details').select('sub_category').eq('category', OTHER_CATEGORY).not('sub_category', 'is', null).limit(5000),
    ])
    setCats(rows || [])
    const t = Number(st?.value?.threshold) || DEFAULT_THRESHOLD
    setThreshold(t); setThresholdInput(String(t))
    const groups = new Map()
    for (const r of other || []) {
      const text = String(r.sub_category || '').trim()
      const k = roughKey(text)
      if (!k || k.length < 3 || text.length > 40 || k.startsWith('zoho category')) continue
      const g = groups.get(k) || { count: 0, spellings: new Map() }
      g.count++; g.spellings.set(text, (g.spellings.get(text) || 0) + 1)
      groups.set(k, g)
    }
    setTyped([...groups.entries()].map(([k, g]) => ({ k, count: g.count, name: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.count - a.count))
  }
  useEffect(() => { load() }, [])

  async function setActive(c, active) {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('custom_categories').update({ active, changed_by: user?.email || null, changed_at: new Date().toISOString() }).eq('id', c.id)
    setBusy(false)
    if (error) { setMsg('That could not be saved. Please try again.'); return }
    logActivity({ entityType: 'settings', entityId: 'categories', entityRef: c.name, action: active ? 'category_shown' : 'category_hidden', toValue: c.name, actor: user })
    await refreshCustomCategories()
    load()
  }

  async function saveThreshold() {
    const n = Math.round(Number(thresholdInput))
    if (!(n >= 2 && n <= 100)) { setMsg('Use a number from 2 to 100.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('system_state').upsert({ key: 'category_auto', value: { threshold: n }, updated_at: new Date().toISOString(), updated_by: user?.email || null })
    setBusy(false)
    if (error) { setMsg('That could not be saved. Please try again.'); return }
    logActivity({ entityType: 'settings', entityId: 'categories', entityRef: 'Auto categories', action: 'category_threshold_changed', fromValue: String(threshold), toValue: String(n), actor: user })
    setMsg(`Saved. A category is made after something is typed under Other ${n} times.`)
    load()
  }

  const known = useMemo(() => new Set((cats || []).map(c => c.key)), [cats])
  const closeBy = useMemo(() => (typed || []).filter(t => t.count >= 2 && t.count < threshold && !known.has(t.k)).slice(0, 10), [typed, threshold, known])

  if (cats === null) return <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Categories from Other</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px', maxWidth: '640px' }}>
        When someone picks Other they say what it is. Once the same thing has been typed enough times it becomes a category by itself and shows in every category list.
        Past records are not changed. A new category has no TDS rule yet, so add one in TDS Rules if it needs one.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '13px', color: 'var(--ink)' }}>
        <span>Make a category after it is typed under Other</span>
        <input type="number" min="2" max="100" value={thresholdInput} onChange={e => setThresholdInput(e.target.value)} aria-label="Times typed before it becomes a category"
          style={{ height: '30px', width: '64px', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: '13px', fontFamily: 'inherit' }} />
        <span>times</span>
        <button type="button" disabled={busy || Number(thresholdInput) === threshold} onClick={saveThreshold} style={{ ...smallBtn(true), opacity: busy || Number(thresholdInput) === threshold ? 0.5 : 1 }}>Save</button>
      </div>
      {msg && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{msg}</div>}

      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '20px 0 8px' }}>Made from Other</div>
      {cats.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None yet. The first one appears when something is typed under Other {threshold} times.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Category</th><th style={th}>Typed</th><th style={th}>Made on</th><th style={th}>Status</th><th style={th} /></tr></thead>
          <tbody>
            {cats.map(c => (
              <tr key={c.id}>
                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                <td style={td}>{c.times_seen ? `${c.times_seen} times` : ''}</td>
                <td style={td}>{fmtDate(c.created_at)}</td>
                <td style={{ ...td, color: c.active ? 'var(--moss-text)' : 'var(--text-muted)' }}>{c.active ? 'In every list' : 'Hidden'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button type="button" disabled={busy} onClick={() => setActive(c, !c.active)} style={smallBtn(false)}>{c.active ? 'Hide' : 'Show again'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '24px 0 8px' }}>Getting close</div>
      {typed === null ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Looking…</div>
      ) : closeBy.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nothing is close. Things typed under Other twice or more show here.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Typed under Other</th><th style={th}>Times</th></tr></thead>
          <tbody>
            {closeBy.map(t => (
              <tr key={t.k}><td style={td}>{t.name}</td><td style={td}>{t.count} of {threshold}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
