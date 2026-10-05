import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getRoleLabel } from '../../lib/auth'
import { DELEGATABLE_ROLES } from '../../lib/delegation'
import { logActivity } from '../../lib/activityLog'

// People who can be handed approvals: anyone who can open the approval screens.
// (An employee-role delegate couldn't even open the PR/PO detail pages.)
const DELEGATE_ROLES = ['admin', 'finance', 'fl', 'super_fl', 'pr_approver', 'coo']

function todayStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fmt(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function statusOf(d) {
  if (d.revoked_at) return { label: 'Revoked', color: 'var(--text-muted)', bg: 'var(--taupe-100)' }
  const t = todayStr()
  if (d.end_date < t) return { label: 'Ended', color: 'var(--text-muted)', bg: 'var(--taupe-100)' }
  if (d.start_date > t) return { label: 'Upcoming', color: 'var(--gold-text)', bg: 'var(--gold-bg)' }
  return { label: 'Active', color: 'var(--moss-text)', bg: 'var(--moss-bg)' }
}

const inputStyle = {
  width: '100%', height: '38px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
  padding: '0 10px', fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)',
  outline: 'none', boxSizing: 'border-box',
}
const labelStyle = { fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '5px', display: 'block' }

// Out-of-office hand-off. mode='self': the signed-in approver sets up their own
// delegation (shown on their profile). mode='admin': an admin can create one for
// anyone and revoke any. While a delegation is active the delegate can act on
// whatever the delegator could (see src/lib/delegation.js).
export default function Delegations({ user, mode = 'self' }) {
  const isAdminMode = mode === 'admin'
  const canDelegate = isAdminMode || DELEGATABLE_ROLES.includes(user.role)

  const [members, setMembers] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [delegatorEmail, setDelegatorEmail] = useState(isAdminMode ? '' : user.email)
  const [delegateEmail, setDelegateEmail] = useState('')
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { if (canDelegate) load() }, [canDelegate])

  async function load() {
    setLoading(true)
    let q = supabase.from('approval_delegations').select('*').order('created_at', { ascending: false }).limit(100)
    if (!isAdminMode) q = q.in('delegator_email', user.ownEmails || [user.email])
    const [{ data: m }, { data: d }] = await Promise.all([
      supabase.from('team_members').select('name, email, role').order('name'),
      q,
    ])
    setMembers(m || [])
    setRows(d || [])
    setLoading(false)
  }

  if (!canDelegate) return null

  const delegators = members.filter(m => DELEGATABLE_ROLES.includes(m.role))
  const delegates = members.filter(m => DELEGATE_ROLES.includes(m.role) && m.email.toLowerCase() !== delegatorEmail.toLowerCase())

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    const delegator = isAdminMode ? members.find(m => m.email === delegatorEmail) : { name: user.name, email: user.email, role: user.role }
    const delegate = members.find(m => m.email === delegateEmail)
    if (!delegator) { setError('Choose whose approvals are being handed off.'); return }
    if (!DELEGATABLE_ROLES.includes(delegator.role)) { setError(`${getRoleLabel(delegator.role)} approvals can't be delegated.`); return }
    if (!delegate) { setError('Choose who will cover for them.'); return }
    if (!startDate || !endDate || endDate < startDate) { setError('End date must be on or after the start date.'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('approval_delegations').insert({
      delegator_email: delegator.email, delegator_name: delegator.name, delegator_role: delegator.role,
      delegate_email: delegate.email, delegate_name: delegate.name,
      start_date: startDate, end_date: endDate, note: note.trim() || null, created_by: user.email,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    logActivity({
      entityType: 'delegation', entityId: data.id, entityRef: `${delegator.name} → ${delegate.name}`,
      action: 'created', toValue: `${startDate} to ${endDate}`, actor: user, note: note.trim() || null,
    })
    setDelegateEmail(''); setNote(''); setStartDate(todayStr()); setEndDate(todayStr())
    if (isAdminMode) setDelegatorEmail('')
    load()
  }

  async function handleRevoke(d) {
    if (!window.confirm(`Revoke ${d.delegate_name || d.delegate_email} covering for ${d.delegator_name || d.delegator_email}?`)) return
    await supabase.from('approval_delegations').update({ revoked_at: new Date().toISOString() }).eq('id', d.id)
    logActivity({
      entityType: 'delegation', entityId: d.id, entityRef: `${d.delegator_name} → ${d.delegate_name}`,
      action: 'revoked', fromValue: 'active', toValue: 'revoked', actor: user,
    })
    load()
  }

  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
        {isAdminMode ? 'Approval delegations' : 'Out of office'}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
        {isAdminMode
          ? 'Hand an approver’s queue to a teammate for a date range. The teammate can approve or reject whatever the approver could, and every action is logged as done on their behalf.'
          : 'Going on leave? Pick a teammate to cover your approvals for these dates. They can approve or reject whatever you could, and it’s logged as done on your behalf.'}
      </div>

      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '8px' }}>
        {isAdminMode && (
          <div>
            <label style={labelStyle}>Approver going away</label>
            <select value={delegatorEmail} onChange={e => setDelegatorEmail(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {delegators.map(m => <option key={m.email} value={m.email}>{m.name} ({getRoleLabel(m.role)})</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={labelStyle}>Covered by</label>
          <select value={delegateEmail} onChange={e => setDelegateEmail(e.target.value)} style={inputStyle}>
            <option value="">Select a teammate…</option>
            {delegates.map(m => <option key={m.email} value={m.email}>{m.name} ({getRoleLabel(m.role)})</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>From</label>
          <input type="date" value={startDate} min={todayStr()} onChange={e => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Until</label>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. On leave, back Monday" style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="submit"
            disabled={saving}
            style={{ height: '38px', padding: '0 20px', background: saving ? 'var(--text-muted)' : 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Set delegation'}
          </button>
          {error && <span style={{ fontSize: '12px', color: 'var(--clay-text)' }}>{error}</span>}
        </div>
      </form>

      <div style={{ marginTop: '22px' }}>
        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No delegations yet.</div>
        ) : (
          <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {rows.map((d, i) => {
              const st = statusOf(d)
              const live = st.label === 'Active' || st.label === 'Upcoming'
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderTop: i ? '1px solid var(--taupe-100)' : 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600 }}>
                      {d.delegator_name || d.delegator_email} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>→</span> {d.delegate_name || d.delegate_email}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {getRoleLabel(d.delegator_role)} · {fmt(d.start_date)} – {fmt(d.end_date)}{d.note ? ` · ${d.note}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-sm)', color: st.color, background: st.bg }}>{st.label}</span>
                  {live && (
                    <span onClick={() => handleRevoke(d)} style={{ fontSize: '12px', color: 'var(--clay-text)', cursor: 'pointer', textDecoration: 'underline' }}>Revoke</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
