import { useEffect, useRef, useState } from 'react'

// A small "i" icon that opens a click-to-show (not hover) arrow-pointer
// popover with plain-language guidance — meant for the handful of genuinely
// confusing steps in a form, not every field. Click again or click outside
// to close; re-openable anytime so the guidance can be "re-read," matching
// how a first-time user would actually want to use it (once, then maybe
// again later), not a fleeting hover tooltip.
//
// Same floating-panel recipe as VendorColumnPicker.jsx/VendorSelector.jsx —
// position:relative wrapper, position:absolute panel, an invisible
// full-screen click-catcher div under the panel for outside-click dismissal
// — so it looks and behaves like everything else in this codebase rather
// than introducing a new pattern.
export default function InfoTip({ text, side = 'top' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const isTop = side === 'top'

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: '6px' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="More information"
        style={{
          width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
          border: '1px solid var(--taupe-400)', background: open ? 'var(--action)' : 'var(--surface-card)',
          color: open ? 'var(--surface-card)' : 'var(--action)',
          fontSize: '10px', fontWeight: 700, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
      >
        i
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div
            style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              [isTop ? 'bottom' : 'top']: '26px',
              zIndex: 100, width: 'max-content', maxWidth: '260px',
              background: 'var(--surface-card)', border: '1px solid var(--taupe-200)',
              borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(54, 32, 26,0.12)',
              padding: '10px 12px', fontSize: '12px', lineHeight: 1.5, color: 'var(--ink)',
              fontWeight: 400, textAlign: 'left', textTransform: 'none', letterSpacing: 'normal',
            }}
          >
            {text}
            <span
              style={{
                position: 'absolute', left: '50%', marginLeft: '-5px',
                [isTop ? 'bottom' : 'top']: '-5px',
                width: '10px', height: '10px', background: 'var(--surface-card)',
                border: '1px solid var(--taupe-200)',
                borderTop: isTop ? 'none' : undefined,
                borderLeft: isTop ? 'none' : undefined,
                borderBottom: isTop ? undefined : 'none',
                borderRight: isTop ? undefined : 'none',
                transform: 'rotate(45deg)',
              }}
            />
          </div>
        </>
      )}
    </span>
  )
}
