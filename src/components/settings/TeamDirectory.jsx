import { useState, useMemo } from 'react'
import { getRoleLabel, FINANCE_ADMIN_VISIBLE_ROLES } from '../../lib/auth'

const th = { fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 12px 8px 0', textAlign: 'left' }
const td = { fontSize: '13px', color: 'var(--ink)', padding: '9px 12px 9px 0', borderTop: '1px solid var(--taupe-200)' }
const control = { height: '34px', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', fontFamily: 'inherit', background: 'var(--surface-card)', color: 'var(--ink)', boxSizing: 'border-box', outline: 'none' }

// What a Finance Admin sees in place of Team & Roles: only the people who hold the Finance
// team, PR Approver and Functional Leader roles, to look at and nothing more. Adding,
// editing and removing people stays with admins.
export default function TeamDirectory({ members, loading }) {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (members || [])
      .filter(m => FINANCE_ADMIN_VISIBLE_ROLES.includes(m.role))
      .filter(m => !role || m.role === role)
      .filter(m => !q || String(m.name || '').toLowerCase().includes(q) || String(m.email || '').toLowerCase().includes(q))
  }, [members, search, role])

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Team</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px', maxWidth: '620px' }}>
        The people who approve at each step: the Finance team, PR approvers and Functional Leaders. This is a list to look at.
        Only an admin can add, change or remove anyone.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" aria-label="Search the team" style={{ ...control, flex: '1 1 220px', maxWidth: '300px' }} />
        <select value={role} onChange={e => setRole(e.target.value)} aria-label="Filter by role" style={control}>
          <option value="">All roles</option>
          {FINANCE_ADMIN_VISIBLE_ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No one matches.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={th}>Function</th><th style={th}>Approves vendors</th><th style={th}>Approves POs</th></tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id || m.email}>
                <td style={{ ...td, fontWeight: 600 }}>{m.name}</td>
                <td style={td}>{m.email}</td>
                <td style={td}>{getRoleLabel(m.role)}</td>
                <td style={td}>{m.function || '—'}</td>
                <td style={td}>{m.role === 'finance' ? (m.can_approve_vendors ? 'Yes' : 'No') : '—'}</td>
                <td style={td}>{m.role === 'finance' ? (m.can_approve_pos ? 'Yes' : 'No') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
