import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ROLES, getRoleLabel } from '../../lib/auth'

const EMPTY_FORM = { name: '', email: '', role: 'employee', can_approve_vendors: false }

export default function SettingsView({ user }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('team_members').select('*').order('name')
    setMembers(data || [])
    setLoading(false)
  }

  if (user.role !== 'admin') {
    return (
      <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>
        Access restricted to admins.
      </div>
    )
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()
    if (!name || !email.includes('@')) { setError('Enter a name and a valid email.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('team_members').insert({
      name, email, role: form.role,
      can_approve_vendors: form.role === 'finance' ? form.can_approve_vendors : false,
    })
    setSaving(false)
    if (err) { setError(err.code === '23505' ? 'That email is already a team member.' : err.message); return }
    setForm(EMPTY_FORM)
    setShowAdd(false)
    load()
  }

  async function handleRemove(member) {
    if (member.email.toLowerCase() === user.email.toLowerCase()) return
    if (!window.confirm(`Remove ${member.name} (${member.email})? They will lose access immediately.`)) return
    setRemovingId(member.id)
    await supabase.from('team_members').delete().eq('id', member.id)
    setMembers(prev => prev.filter(m => m.id !== member.id))
    setRemovingId(null)
  }

  async function handleRoleChange(member, role) {
    const patch = { role, can_approve_vendors: role === 'finance' ? member.can_approve_vendors : false }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, ...patch } : m))
    await supabase.from('team_members').update(patch).eq('id', member.id)
  }

  async function handleApproveToggle(member, checked) {
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, can_approve_vendors: checked } : m))
    await supabase.from('team_members').update({ can_approve_vendors: checked }).eq('id', member.id)
  }

  const selectStyle = {
    height: '30px', border: '1px solid #E3E8EF', borderRadius: '3px',
    padding: '0 8px', fontSize: '12px', color: '#1A1F36', background: '#FFFFFF',
  }

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8EF', padding: '0 28px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '14px 0' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: 0 }}>Team & Roles</h1>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button
            onClick={() => { setShowAdd(v => !v); setError(null) }}
            style={{
              height: '34px', padding: '0 16px', background: '#8C3225', color: '#FFFFFF',
              border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showAdd ? 'Cancel' : '+ Add Member'}
          </button>
        </div>

        {showAdd && (
          <form
            onSubmit={handleAdd}
            style={{
              background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px',
              padding: '20px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' }}>Name</div>
              <input
                type="text" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ height: '34px', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '0 10px', fontSize: '13px', width: '200px' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' }}>Email</div>
              <input
                type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="name@thenudge.org"
                style={{ height: '34px', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '0 10px', fontSize: '13px', width: '240px' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' }}>Role</div>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ ...selectStyle, height: '34px' }}
              >
                {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
              </select>
            </div>
            {form.role === 'finance' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#374151', paddingBottom: '8px' }}>
                <input
                  type="checkbox" checked={form.can_approve_vendors}
                  onChange={e => setForm(f => ({ ...f, can_approve_vendors: e.target.checked }))}
                />
                Can approve vendors
              </label>
            )}
            <button
              type="submit" disabled={saving}
              style={{
                height: '34px', padding: '0 16px', background: saving ? '#E5E7EB' : '#1A1F36', color: '#FFFFFF',
                border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Add'}
            </button>
            {error && <div style={{ fontSize: '12px', color: '#B91C1C', width: '100%' }}>{error}</div>}
          </form>
        )}

        {loading ? (
          <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
        ) : (
          <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
                  {['Name', 'Email', 'Role', 'Can Approve Vendors', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => {
                  const isSelf = m.email.toLowerCase() === user.email.toLowerCase()
                  return (
                    <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? '1px solid #F3F4F6' : 'none', background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#1A1F36', fontWeight: 500 }}>{m.name}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: '#374151', fontFamily: 'monospace' }}>{m.email}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m, e.target.value)}
                          style={selectStyle}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {m.role === 'admin' ? (
                          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>always</span>
                        ) : m.role === 'finance' ? (
                          <input
                            type="checkbox" checked={!!m.can_approve_vendors}
                            onChange={e => handleApproveToggle(m, e.target.checked)}
                          />
                        ) : (
                          <span style={{ fontSize: '12px', color: '#D1D5DB' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {!isSelf && (
                          <button
                            onClick={() => handleRemove(m)}
                            disabled={removingId === m.id}
                            style={{
                              height: '28px', padding: '0 12px', background: '#FFFFFF', color: '#B91C1C',
                              border: '1px solid #FECACA', borderRadius: '3px', fontSize: '12px', cursor: 'pointer',
                            }}
                          >
                            {removingId === m.id ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
