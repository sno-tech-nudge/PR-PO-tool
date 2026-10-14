import { useState } from 'react'
import { listAccountsTeam, assignReport } from '../../lib/assignment'

// Who on the Accounts team owns this report. Shows the owner, lets the viewer
// claim it, and lets anyone on the team hand it to someone else.
export default function AssignmentControl({ report, user, onChanged, compact = false }) {
  const [assigned, setAssigned] = useState({ email: report.assigned_to_email || null, name: report.assigned_to_name || null })
  const [team, setTeam] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const canAct = user?.role === 'finance' || user?.role === 'admin'
  const mine = !!assigned.email && (user?.ownEmails || [user?.email]).includes(assigned.email)

  async function change(member) {
    setBusy(true); setError(null)
    try {
      const patch = await assignReport({ report: { ...report, assigned_to_email: assigned.email, assigned_to_name: assigned.name }, member, by: user })
      setAssigned({ email: patch.assigned_to_email, name: patch.assigned_to_name })
      onChanged?.(patch)
    } catch { setError('Could not change the owner. Please try again.') }
    setBusy(false)
  }

  async function openTeam() {
    if (!team) setTeam(await listAccountsTeam())
  }

  const text = { fontSize: compact ? '11px' : '12px', color: 'var(--text-muted)' }
  const linkBtn = { fontSize: compact ? '11px' : '12px', fontWeight: 600, color: 'var(--action)', cursor: busy ? 'default' : 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <span style={text}>
        {assigned.email
          ? <>Processed by <strong style={{ color: 'var(--ink)' }}>{mine ? 'you' : (assigned.name || assigned.email)}</strong></>
          : 'Not assigned yet'}
      </span>
      {canAct && !mine && (
        <button type="button" disabled={busy} onClick={() => change({ email: user.email, name: user.name })} style={linkBtn}>Claim</button>
      )}
      {canAct && (
        <select
          value="" disabled={busy}
          onFocus={openTeam} onMouseDown={openTeam}
          onChange={e => { const m = (team || []).find(t => t.email === e.target.value); if (m) change(m) }}
          style={{ height: compact ? '24px' : '28px', fontSize: '11px', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', color: 'var(--ink)', padding: '0 6px' }}
          aria-label="Reassign this report"
        >
          <option value="">{assigned.email ? 'Reassign…' : 'Assign to…'}</option>
          {(team || []).map(t => <option key={t.email} value={t.email}>{t.name || t.email}</option>)}
        </select>
      )}
      {error && <span style={{ fontSize: '11px', color: 'var(--clay-text)' }}>{error}</span>}
    </div>
  )
}
