import { fmtStamp } from '../../lib/systemLogExport'

const when = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// At the top of every screen when it matters:
//  - an admin sees it all the way through a maintenance window, with a button to end it
//  - everyone is told in the hour before a window starts, so they can save their work
export function MaintenanceBanner({ maintenance, status, isAdmin, now, onEnd, busy }) {
  const base = { padding: '9px 20px', fontSize: '12px', lineHeight: 1.5, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }
  if (status === 'active' && isAdmin) {
    return (
      <div role="status" style={{ ...base, background: 'var(--gold-bg)', borderBottom: '1px solid var(--gold-border)', color: 'var(--gold-text)' }}>
        <span><strong>Maintenance is on.</strong> Everyone except admins sees a maintenance page. You can still use everything.</span>
        <button
          type="button" disabled={busy} onClick={onEnd}
          style={{ height: '26px', padding: '0 12px', border: '1px solid var(--gold-text)', background: 'var(--surface-card)', color: 'var(--gold-text)', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Ending…' : 'End maintenance'}
        </button>
      </div>
    )
  }
  if (status === 'scheduled') {
    const minsAway = (new Date(maintenance.scheduled_start).getTime() - now) / 60000
    if (minsAway > 60) return null
    return (
      <div role="status" style={{ ...base, background: 'var(--gold-bg)', borderBottom: '1px solid var(--gold-border)', color: 'var(--gold-text)' }}>
        <span><strong>Maintenance starts at {new Date(maintenance.scheduled_start).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.</strong>{maintenance.reason ? ` ${maintenance.reason}.` : ''} Please save your work before then.</span>
      </div>
    )
  }
  return null
}

// Replaces the whole app for everyone except admins while maintenance is on.
export function MaintenancePage({ maintenance, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-hot)', padding: '24px' }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center', background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', padding: '36px 32px', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>The Nudge Institute</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>Under maintenance</div>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The system is down for maintenance{maintenance.scheduled_start ? ` since ${fmtStamp(maintenance.scheduled_start)}` : ''}.
          {maintenance.reason ? ` ${maintenance.reason}.` : ''}
          {maintenance.scheduled_end ? ` It should be back by ${when(maintenance.scheduled_end)}.` : ' Please try again in a little while.'}
          {' '}Nothing you have saved is lost.
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '20px' }}>
          <button onClick={() => window.location.reload()} style={{ height: '36px', padding: '0 18px', border: 'none', background: 'var(--ink)', color: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Check again</button>
          <button onClick={onSignOut} style={{ height: '36px', padding: '0 18px', border: '1px solid var(--taupe-300)', background: 'var(--surface-card)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
