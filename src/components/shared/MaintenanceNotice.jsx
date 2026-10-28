import { fmtStamp } from '../../lib/systemLogExport'

// Shown to everyone while an admin has maintenance mode on.
export function MaintenanceBanner({ maintenance }) {
  return (
    <div role="status" style={{ background: 'var(--gold-bg)', borderBottom: '1px solid var(--gold-border)', color: 'var(--gold-text)', padding: '9px 20px', fontSize: '12px', lineHeight: 1.5, textAlign: 'center' }}>
      <strong>The system is under maintenance.</strong>{' '}
      {maintenance.reason ? `${maintenance.reason} ` : ''}Some things may be slow or briefly unavailable.
    </div>
  )
}

// Replaces the app for everyone except admins when maintenance mode also blocks access.
export function MaintenancePage({ maintenance, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--taupe-50)', padding: '24px' }}>
      <div style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>The/Nudge</div>
        <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--ink)', marginBottom: '10px' }}>We&apos;ll be right back</div>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '8px' }}>
          The system is under maintenance{maintenance.started_at ? ` since ${fmtStamp(maintenance.started_at)}` : ''}.
          {maintenance.reason ? ` ${maintenance.reason}` : ''} Please try again in a little while. Nothing you have saved is lost.
        </div>
        <button onClick={onSignOut} style={{ marginTop: '12px', height: '36px', padding: '0 18px', border: '1px solid var(--taupe-300)', background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}>Sign out</button>
      </div>
    </div>
  )
}
