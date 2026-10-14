import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { EXPENSE_CATEGORIES } from '../../lib/expenseCategories'
import { computeTds } from '../../lib/tds'
import { logActivity } from '../../lib/activityLog'

const PAYEE_LABELS = { any: 'Any vendor', individual: 'Individuals and HUF', other: 'Companies, firms and others' }
const money = n => (n == null || n === '' ? 'None' : `₹${Number(n).toLocaleString('en-IN')}`)

const input = {
  height: '34px', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px',
  fontFamily: 'inherit', background: 'var(--surface-card)', color: 'var(--ink)', boxSizing: 'border-box', outline: 'none', width: '100%',
}
const lab = { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }
const btn = primary => ({
  height: '34px', padding: '0 16px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--taupe-300)', background: primary ? 'var(--action)' : 'var(--surface-card)', color: primary ? 'var(--surface-card)' : 'var(--ink)',
})

const EMPTY = { section: '', label: '', categories: [], payee_type: 'any', rate: '', no_pan_rate: '20', single_threshold: '', annual_threshold: '', notes: '', active: true }

function RuleForm({ initial, onSave, onCancel, saving, error }) {
  const [f, setF] = useState(() => ({
    ...EMPTY, ...initial,
    rate: initial?.rate != null ? String(initial.rate) : '',
    no_pan_rate: initial?.no_pan_rate != null ? String(initial.no_pan_rate) : '20',
    single_threshold: initial?.single_threshold != null ? String(initial.single_threshold) : '',
    annual_threshold: initial?.annual_threshold != null ? String(initial.annual_threshold) : '',
    notes: initial?.notes || '',
  }))
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const toggleCat = c => set('categories', f.categories.includes(c) ? f.categories.filter(x => x !== c) : [...f.categories, c])
  const valid = f.section.trim() && f.categories.length > 0 && Number(f.rate) > 0

  return (
    <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', background: 'var(--taupe-50)', padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
        <div><label style={lab}>TDS section</label><input style={input} value={f.section} onChange={e => set('section', e.target.value)} placeholder="e.g. 194J" /></div>
        <div><label style={lab}>Name</label><input style={input} value={f.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Professional fees" /></div>
        <div>
          <label style={lab}>Vendor type</label>
          <select style={input} value={f.payee_type} onChange={e => set('payee_type', e.target.value)}>
            {Object.entries(PAYEE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label style={lab}>Rate (%)</label><input style={input} type="number" min="0" step="0.01" value={f.rate} onChange={e => set('rate', e.target.value)} /></div>
        <div><label style={lab}>Rate if no PAN (%)</label><input style={input} type="number" min="0" step="0.01" value={f.no_pan_rate} onChange={e => set('no_pan_rate', e.target.value)} /></div>
        <div><label style={lab}>Limit on one bill (₹, optional)</label><input style={input} type="number" min="0" value={f.single_threshold} onChange={e => set('single_threshold', e.target.value)} /></div>
        <div><label style={lab}>Limit in a year (₹, optional)</label><input style={input} type="number" min="0" value={f.annual_threshold} onChange={e => set('annual_threshold', e.target.value)} /></div>
      </div>

      <label style={lab}>Applies to these expense categories (the ledger)</label>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {EXPENSE_CATEGORIES.map(c => {
          const on = f.categories.includes(c)
          return (
            <span key={c} role="button" onClick={() => toggleCat(c)} style={{
              padding: '5px 10px', fontSize: '12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${on ? 'var(--action)' : 'var(--taupe-300)'}`, background: on ? 'var(--action)' : 'var(--surface-card)', color: on ? 'var(--surface-card)' : 'var(--ink)',
            }}>{c}</span>
          )
        })}
      </div>

      <label style={lab}>Notes (optional)</label>
      <input style={{ ...input, marginBottom: '12px' }} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything Accounts should remember about this rule" />

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        TDS applies when one bill is over the single-bill limit, or when payments to the same vendor in the financial year go over the yearly limit. Leave a limit empty if it does not apply. With neither limit set, TDS applies on every bill.
      </div>
      {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" disabled={!valid || saving} onClick={() => onSave(f)} style={{ ...btn(true), opacity: !valid || saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save rule'}</button>
        <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
      </div>
    </div>
  )
}

// Admin screen for the TDS rules the whole app applies: which expense
// categories carry TDS, at what rate for which kind of vendor, and above what
// limits. Saved rules are used immediately by every vendor payment.
export default function TdsRules({ user }) {
  const isAdmin = user?.role === 'admin'
  const [rules, setRules] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | rule id
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    const { data } = await supabase.from('tds_rules').select('*').order('section', { ascending: true }).order('payee_type', { ascending: true })
    setRules(data || [])
  }
  useEffect(() => { load() }, [])

  async function save(f) {
    setSaving(true); setError(null)
    const row = {
      section: f.section.trim(), label: f.label.trim() || f.section.trim(), categories: f.categories, payee_type: f.payee_type,
      rate: Number(f.rate), no_pan_rate: Number(f.no_pan_rate) || 20,
      single_threshold: f.single_threshold === '' ? null : Number(f.single_threshold),
      annual_threshold: f.annual_threshold === '' ? null : Number(f.annual_threshold),
      notes: f.notes.trim() || null, active: f.active !== false, source: 'custom',
    }
    const { error: err } = editing === 'new' ? await supabase.from('tds_rules').insert(row) : await supabase.from('tds_rules').update(row).eq('id', editing)
    setSaving(false)
    if (err) { setError(err.message); return }
    logActivity({ entityType: 'settings', entityId: 'tds_rules', entityRef: `TDS ${row.section}`, action: editing === 'new' ? 'tds_rule_added' : 'tds_rule_changed', toValue: `${row.rate}% ${PAYEE_LABELS[row.payee_type]}`, actor: user, note: row.categories.join(', ') })
    setEditing(null)
    load()
  }

  async function toggle(rule) {
    await supabase.from('tds_rules').update({ active: !rule.active }).eq('id', rule.id)
    load()
  }
  async function remove(rule) {
    if (!window.confirm(`Delete the ${rule.section} rule "${rule.label}"? Vendor payments in these categories will show no TDS rule.`)) return
    await supabase.from('tds_rules').delete().eq('id', rule.id)
    logActivity({ entityType: 'settings', entityId: 'tds_rules', entityRef: `TDS ${rule.section}`, action: 'tds_rule_deleted', toValue: rule.label, actor: user })
    load()
  }

  // A small calculator so a rule can be tried out before anyone relies on it.
  const [t, setT] = useState({ category: 'Professional Fee', pan: '', base: '100000', ytd: '0' })
  const activeRules = useMemo(() => (rules || []).filter(r => r.active), [rules])
  const trial = useMemo(() => computeTds({ rules: activeRules, category: t.category, pan: t.pan, base: t.base, ytdBase: Number(t.ytd) || 0 }), [activeRules, t])

  if (!isAdmin) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>TDS rules can be changed by admins only.</div>
  if (!rules) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>

  const hasStarter = rules.some(r => r.source === 'starter')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ maxWidth: '640px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>TDS rules</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
            Set once here and applied automatically to every vendor payment and to advances paid to vendors. Accounts only splits the amount into base and GST. The system picks the rule from the expense category and the vendor&apos;s PAN, and works out the TDS.
          </div>
        </div>
        {editing === null && <button type="button" onClick={() => { setEditing('new'); setError(null) }} style={btn(true)}>+ Add rule</button>}
      </div>

      {hasStarter && (
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--gold-text)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: '14px' }}>
          Rules marked <strong>Starter</strong> come from the standard provisions and have not been confirmed by Finance. Edit them to match Finance&apos;s own rules; saving one makes it yours.
        </div>
      )}

      {editing === 'new' && <RuleForm onSave={save} onCancel={() => setEditing(null)} saving={saving} error={error} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {rules.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0' }}>No rules yet. With none, no vendor payment will show TDS.</div>}
        {rules.map(r => editing === r.id ? (
          <RuleForm key={r.id} initial={r} onSave={save} onCancel={() => setEditing(null)} saving={saving} error={error} />
        ) : (
          <div key={r.id} style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '12px 14px', opacity: r.active ? 1 : 0.55 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                {r.section} · {r.label}
                {r.source === 'starter' && <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, color: 'var(--gold-text)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-xs)', padding: '1px 6px' }}>Starter</span>}
                {!r.active && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>Off</span>}
              </div>
              <div style={{ display: 'flex', gap: '14px' }}>
                <span role="button" onClick={() => { setEditing(r.id); setError(null) }} style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}>Edit</span>
                <span role="button" onClick={() => toggle(r)} style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}>{r.active ? 'Turn off' : 'Turn on'}</span>
                <span role="button" onClick={() => remove(r)} style={{ fontSize: '12px', color: 'var(--clay-text)', cursor: 'pointer', textDecoration: 'underline' }}>Delete</span>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink)', marginTop: '6px', lineHeight: 1.6 }}>
              <strong>{r.rate}%</strong> · {PAYEE_LABELS[r.payee_type]} · {r.no_pan_rate}% with no PAN
              {' · '}Limit on one bill: {money(r.single_threshold)}{' · '}Limit in a year: {money(r.annual_threshold)}
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
              {(r.categories || []).map(c => <span key={c} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--radius-xs)', background: 'var(--taupe-100)', color: 'var(--ink)' }}>{c}</span>)}
            </div>
            {r.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>{r.notes}</div>}
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>Try it</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={lab}>Expense category</label>
            <select style={input} value={t.category} onChange={e => setT({ ...t, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label style={lab}>Vendor PAN (optional)</label><input style={input} value={t.pan} onChange={e => setT({ ...t, pan: e.target.value.toUpperCase() })} placeholder="e.g. ABCPD1234E" maxLength={10} /></div>
          <div><label style={lab}>Base amount (₹)</label><input style={input} type="number" value={t.base} onChange={e => setT({ ...t, base: e.target.value })} /></div>
          <div><label style={lab}>Already paid this year (₹)</label><input style={input} type="number" value={t.ytd} onChange={e => setT({ ...t, ytd: e.target.value })} /></div>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
          <strong>{trial.status === 'applicable' ? `TDS ₹${trial.amount.toLocaleString('en-IN')}` : trial.status === 'review' ? 'Needs a look' : 'No TDS'}</strong>
          {trial.section ? ` · ${trial.section}` : ''}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{trial.note}</div>
        </div>
      </div>
    </div>
  )
}
