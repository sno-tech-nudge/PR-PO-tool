import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ROLES, getRoleLabel } from '../../lib/auth'

// Roles that can actually sit in an approval chain — employees raise
// requests, observers only look, neither can be a required approver.
const APPROVER_ROLES = ROLES.filter(r => r !== 'employee' && r !== 'observer')

function emptyForm() {
  return {
    id: null, name: '', description: '', min_amount: '', max_amount: '',
    mode: 'configure', is_active: true,
    levels: [{ label: '', required_role: '' }],
  }
}

function fmtAmount(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function formatRange(rule) {
  const hasMin = rule.min_amount != null
  const hasMax = rule.max_amount != null
  if (hasMin && hasMax) return `Report total > ${fmtAmount(rule.min_amount)} and ≤ ${fmtAmount(rule.max_amount)}`
  if (hasMin) return `Report total > ${fmtAmount(rule.min_amount)}`
  if (hasMax) return `Report total ≤ ${fmtAmount(rule.max_amount)}`
  return 'Any amount'
}

function modeSummary(rule) {
  if (rule.mode === 'auto_approve') return 'Auto approve'
  if (rule.mode === 'auto_reject') return 'Auto reject'
  const levels = rule.levels || []
  if (levels.length === 0) return 'No levels configured'
  return levels.map(l => l.label).join(' → ')
}

export default function ApprovalRulesView() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null) // null | 'new' | rule.id
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('approval_rules').select('*').order('sort_order')
    setRules(data || [])
    setLoading(false)
  }

  function startEdit(rule) {
    setForm({
      id: rule.id,
      name: rule.name,
      description: rule.description || '',
      min_amount: rule.min_amount ?? '',
      max_amount: rule.max_amount ?? '',
      mode: rule.mode,
      is_active: rule.is_active,
      levels: rule.levels && rule.levels.length
        ? rule.levels.map(l => ({ label: l.label, required_role: l.required_role || '' }))
        : [{ label: '', required_role: '' }],
    })
    setEditingId(rule.id)
    setError(null)
  }

  function startNew() {
    setForm(emptyForm())
    setEditingId('new')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
  }

  function setLevelCount(n) {
    setForm(f => {
      const levels = [...f.levels]
      while (levels.length < n) levels.push({ label: '', required_role: '' })
      while (levels.length > n) levels.pop()
      return { ...f, levels }
    })
  }

  function updateLevel(i, patch) {
    setForm(f => ({ ...f, levels: f.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    const name = form.name.trim()
    if (!name) { setError('Enter a rule name.'); return }
    if (form.mode === 'configure' && form.levels.some(l => !l.label.trim())) {
      setError('Every approval level needs a label.'); return
    }
    if (form.min_amount !== '' && form.max_amount !== '' && Number(form.min_amount) >= Number(form.max_amount)) {
      setError('The lower bound must be less than the upper bound.'); return
    }

    setSaving(true)
    const payload = {
      name,
      description: form.description.trim() || null,
      min_amount: form.min_amount === '' ? null : Number(form.min_amount),
      max_amount: form.max_amount === '' ? null : Number(form.max_amount),
      mode: form.mode,
      levels: form.mode === 'configure' ? form.levels.map(l => ({ label: l.label.trim(), required_role: l.required_role || null })) : [],
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }

    let err
    if (form.id) {
      ({ error: err } = await supabase.from('approval_rules').update(payload).eq('id', form.id))
    } else {
      const maxSort = rules.reduce((m, r) => Math.max(m, r.sort_order || 0), 0)
      ;({ error: err } = await supabase.from('approval_rules').insert({ ...payload, sort_order: maxSort + 1 }))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    cancelEdit()
    load()
  }

  async function handleDelete(rule) {
    if (!window.confirm(`Delete the "${rule.name}" approval rule? Reports already routed under it are unaffected — only future submissions stop matching it.`)) return
    await supabase.from('approval_rules').delete().eq('id', rule.id)
    if (editingId === rule.id) cancelEdit()
    load()
  }

  async function handleToggleActive(rule) {
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)))
    await supabase.from('approval_rules').update({ is_active: !rule.is_active }).eq('id', rule.id)
  }

  async function move(rule, dir) {
    const idx = rules.findIndex(r => r.id === rule.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= rules.length) return
    const other = rules[swapIdx]
    await Promise.all([
      supabase.from('approval_rules').update({ sort_order: other.sort_order }).eq('id', rule.id),
      supabase.from('approval_rules').update({ sort_order: rule.sort_order }).eq('id', other.id),
    ])
    load()
  }

  const inputStyle = {
    height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
    padding: '0 10px', fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)',
  }
  const labelStyle = { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }
  const btnPrimary = {
    height: '34px', padding: '0 16px', background: 'var(--action)', color: 'var(--surface-card)',
    border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  }
  const btnGhost = {
    height: '30px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--ink)',
    border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '16px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', maxWidth: '640px' }}>
          Rules decide who must approve an expense report based on its total amount. Rules are
          checked top to bottom — the first rule whose range matches wins. This drives both the
          approval steps a report actually goes through and the "Approval route" preview shown
          before submission.
        </div>
        {editingId === null && (
          <button onClick={startNew} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>+ Add Rule</button>
        )}
      </div>

      {editingId !== null && (
        <form
          onSubmit={handleSave}
          style={{
            background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
            padding: '20px', marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '14px' }}>
            {form.id ? 'Edit approval rule' : 'New approval rule'}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: '1 1 220px' }}>
              <div style={labelStyle}>Rule name</div>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ flex: '2 1 320px' }}>
              <div style={labelStyle}>Description (optional)</div>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Criteria
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div>
              <div style={labelStyle}>Report total greater than (₹)</div>
              <input type="number" min="0" placeholder="No lower bound" value={form.min_amount}
                onChange={e => setForm(f => ({ ...f, min_amount: e.target.value }))}
                style={{ ...inputStyle, width: '180px' }} />
            </div>
            <div>
              <div style={labelStyle}>Up to and including (₹)</div>
              <input type="number" min="0" placeholder="No upper bound" value={form.max_amount}
                onChange={e => setForm(f => ({ ...f, max_amount: e.target.value }))}
                style={{ ...inputStyle, width: '180px' }} />
            </div>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Approvals
          </div>
          <div style={{ display: 'flex', gap: '18px', marginBottom: '14px' }}>
            {[['configure', 'Configure approval flow'], ['auto_approve', 'Auto approve'], ['auto_reject', 'Auto reject']].map(([val, label]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                <input type="radio" name="mode" checked={form.mode === val} onChange={() => setForm(f => ({ ...f, mode: val }))} />
                {label}
              </label>
            ))}
          </div>

          {form.mode === 'configure' && (
            <div style={{ background: 'var(--taupe-50)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text)' }}>Number of levels</div>
                <select value={form.levels.length} onChange={e => setLevelCount(Number(e.target.value))} style={{ ...inputStyle, height: '30px' }}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {form.levels.map((lvl, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: i < form.levels.length - 1 ? '8px' : 0 }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%', background: 'var(--action)', color: 'var(--surface-card)',
                    fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <input
                    type="text" placeholder="Level label, e.g. Functional Lead" value={lvl.label}
                    onChange={e => updateLevel(i, { label: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <select value={lvl.required_role} onChange={e => updateLevel(i, { required_role: e.target.value })} style={{ ...inputStyle, width: '220px' }}>
                    <option value="">Any approver (no specific role)</option>
                    {APPROVER_ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginTop: '12px' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, background: saving ? 'var(--taupe-200)' : 'var(--action)' }}>
              {saving ? 'Saving…' : 'Save Rule'}
            </button>
            <button type="button" onClick={cancelEdit} style={btnGhost}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : rules.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>No approval rules yet.</div>
      ) : (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                {['', 'Rule', 'Criteria', 'Approvals', 'Active', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rules.length - 1 ? '1px solid var(--taupe-100)' : 'none', background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)' }}>
                  <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button onClick={() => move(r, -1)} disabled={i === 0} title="Move up" style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--taupe-400)' : 'var(--text-muted)', fontSize: '11px', lineHeight: 1, padding: '2px' }}>▲</button>
                      <button onClick={() => move(r, 1)} disabled={i === rules.length - 1} title="Move down" style={{ background: 'none', border: 'none', cursor: i === rules.length - 1 ? 'default' : 'pointer', color: i === rules.length - 1 ? 'var(--taupe-400)' : 'var(--text-muted)', fontSize: '11px', lineHeight: 1, padding: '2px' }}>▼</button>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink)', fontWeight: 500 }}>
                    {r.name}
                    {r.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>{r.description}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text)' }}>{formatRange(r)}</td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text)' }}>{modeSummary(r)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <input type="checkbox" checked={r.is_active} onChange={() => handleToggleActive(r)} />
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(r)} style={{ ...btnGhost, marginRight: '8px' }}>Edit</button>
                    <button onClick={() => handleDelete(r)} style={{ ...btnGhost, color: 'var(--clay-text)', border: '1px solid var(--clay-border)' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
