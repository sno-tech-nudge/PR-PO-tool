import { useEffect, useLayoutEffect, useState } from 'react'
import { markWalkthroughSeen } from '../../lib/walkthrough'

// Shown once automatically on a first-time visit to Home, with a persistent
// "? Help" trigger (wired in App.jsx's sidebar) to replay it any time after.
// See src/lib/walkthrough.js for the localStorage "seen" flag this reads/writes.

// Steps 1-2 anchor to a real element on the Home screen (matched by the
// `data-tour-anchor` attribute added in App.jsx); steps 3-4 cover fields that
// live inside other forms entirely (Allocation, document preview), so they're
// explanatory-only — a centered card, no live anchor — rather than this tour
// trying to follow someone across a screen navigation.
const STEPS = [
  {
    anchor: 'quick-add',
    text: 'Snap or upload a receipt here and we’ll read the amount, vendor, and date for you — no retyping needed.',
  },
  {
    anchor: 'pr-nav',
    text: 'Need to buy something first? Start a Purchase Request here.',
  },
  {
    anchor: null,
    text: 'When you raise a Purchase Request, look for the ⓘ icon next to Allocation — it explains what % to charge each donor/programme.',
  },
  {
    anchor: null,
    text: 'Before submitting any form, you can preview an attached document first — look for the ↗ Preview link next to any upload.',
  },
]

export default function FirstTimeWalkthrough({ open, onClose }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!open) setStep(0)
  }, [open])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') finish()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const anchorId = STEPS[step]?.anchor

  useLayoutEffect(() => {
    if (!open) return
    if (!anchorId) { setRect(null); return }
    const el = document.querySelector(`[data-tour-anchor="${anchorId}"]`)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    function measure() {
      setRect(el.getBoundingClientRect())
    }
    measure()
    const t = setTimeout(measure, 300) // after the smooth-scroll settles
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [open, anchorId])

  if (!open) return null

  function finish() {
    markWalkthroughSeen()
    onClose()
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else finish()
  }
  function back() {
    if (step > 0) setStep(s => s - 1)
  }

  const cardStyle = {
    position: 'fixed', zIndex: 300, width: '280px',
    background: 'var(--surface-card)', border: '1px solid var(--taupe-200)',
    borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(54, 32, 26,0.18)',
    padding: '16px 18px', fontSize: '13px', lineHeight: 1.5, color: 'var(--ink)',
  }

  // Anchored steps: positioned just below/right of the highlighted element.
  // Centered steps (no live anchor on this screen): dead-center of the viewport.
  const positionStyle = rect
    ? {
        top: Math.min(rect.bottom + 12, window.innerHeight - 220),
        left: Math.min(Math.max(rect.left, 16), window.innerWidth - 296),
      }
    : {
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      }

  return (
    <>
      <div onClick={finish} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.35)', zIndex: 290 }} />

      {rect && (
        <div
          style={{
            position: 'fixed', zIndex: 291, pointerEvents: 'none',
            top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8,
            border: '2px solid var(--action)', borderRadius: 'var(--radius-md)',
            background: 'rgba(255,255,255,0.06)',
          }}
        />
      )}

      <div style={{ ...cardStyle, ...positionStyle }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {step + 1} of {STEPS.length}
        </div>
        <div style={{ marginBottom: '14px' }}>{STEPS[step].text}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span onClick={finish} style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
            Skip tour
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 0 && (
              <button
                onClick={back}
                style={{ height: '30px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              style={{ height: '30px', padding: '0 14px', background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              {step < STEPS.length - 1 ? 'Next' : 'Got it'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
