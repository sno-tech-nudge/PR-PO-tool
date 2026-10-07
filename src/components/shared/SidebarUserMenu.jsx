import { useState, useEffect, useSyncExternalStore } from 'react'
import { getLang, setLang, subscribeLang } from '../../lib/i18n/engine'

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

// The one-row account area at the bottom of the sidebar: initials, name and
// role, and a menu holding Help and Language (Sign out stays its own button
// below). In the folded sidebar
// it is just the initials badge, opening the same menu beside it.
export default function SidebarUserMenu({ user, rail, onHelp }) {
  const [open, setOpen] = useState(false)
  const lang = useSyncExternalStore(subscribeLang, getLang)
  const isHindi = lang === 'hi'

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const badge = (
    <div
      aria-hidden="true"
      style={{
        width: '30px', height: '30px', borderRadius: 'var(--radius-md)', flexShrink: 0,
        background: 'rgba(255,255,255,0.12)', color: 'var(--surface-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600,
      }}
    >
      {initialsOf(user.name)}
    </div>
  )

  const item = (label, onClick, extra) => (
    <button
      type="button"
      onClick={() => { onClick(); setOpen(false) }}
      className="sidebar-menu-item"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: 'var(--radius-md)',
        fontSize: '13px', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span>{label}</span>
      {extra && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{extra}</span>}
    </button>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={rail ? `${user.name} · ${user.roleLabel}` : undefined}
        className="sidebar-item"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px', border: 'none', cursor: 'pointer', textAlign: 'left',
          background: open ? 'rgba(255,255,255,0.08)' : 'transparent', borderRadius: 'var(--radius-md)',
          padding: rail ? '6px 0' : '6px 8px', justifyContent: rail ? 'center' : 'flex-start',
        }}
      >
        {badge}
        {!rail && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--surface-card)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-on-dark-muted)' }}>{user.roleLabel}</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" style={{ color: 'var(--text-on-dark-muted)', flexShrink: 0 }}>
              <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
          <div
            role="menu"
            style={{
              position: 'fixed', zIndex: 300, width: '200px', padding: '6px',
              left: rail ? 'calc(var(--sidebar-w, 68px) + 8px)' : '12px',
              bottom: rail ? '56px' : '112px',
              background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 28px rgba(54, 32, 26,0.25)',
            }}
          >
            {item('Help', onHelp, 'Replay the tour')}
            {item('Language', () => setLang(isHindi ? 'en' : 'hi'), isHindi ? 'हिन्दी' : 'English')}
          </div>
        </>
      )}
    </>
  )
}
