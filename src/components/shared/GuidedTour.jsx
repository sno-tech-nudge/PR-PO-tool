import { useEffect, useLayoutEffect, useState } from 'react'
import { markTourSeen } from '../../lib/walkthrough'

// A step-by-step spotlight tour. Each step in `steps` is { anchor, text }:
// `anchor` names an element carrying data-tour-anchor="<anchor>" on the page
// (the tour scrolls to it and highlights it); a step whose anchor is null or
// isn't on screen right now is shown as a centred card instead, so a tour
// never breaks just because a section isn't visible. Finishing or skipping
// marks `tourKey` as seen so it only auto-opens once per browser.
const CARD_W = 300
const CARD_H_EST = 230

function place(rect) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(CARD_W, vw - 32)
  const left = Math.min(Math.max(rect.left, 16), vw - w - 16)
  const below = rect.bottom + 12
  if (below + CARD_H_EST <= vh - 12) return { top: below, left, width: w }
  const above = rect.top - CARD_H_EST - 12
  if (above >= 12) return { top: above, left, width: w }
  // A tall element fills the screen — tuck the card into the bottom-right.
  return { bottom: 20, left: Math.max(16, vw - w - 24), width: w }
}

export default function GuidedTour({ steps, open, onClose, tourKey }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!open) setStep(0)
  }, [open])

  function finish() {
    markTourSeen(tourKey)
    onClose()
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') { markTourSeen(tourKey); onClose() }
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, tourKey, onClose])

  const anchorId = steps[step]?.anchor

  useLayoutEffect(() => {
    if (!open) return
    const el = anchorId ? document.querySelector(`[data-tour-anchor="${anchorId}"]`) : null
    if (!el) { setRect(null); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    const t = setTimeout(measure, 350) // after the smooth-scroll settles
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchorId])

  if (!open) return null

  const last = step === steps.length - 1
  const cardStyle = {
    position: 'fixed', zIndex: 300,
    background: 'var(--surface-card)', border: '1px solid var(--taupe-200)',
    borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(54, 32, 26,0.18)',
    padding: '16px 18px', fontSize: '13px', lineHeight: 1.5, color: 'var(--ink)',
    boxSizing: 'border-box',
    ...(rect
      ? place(rect)
      : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: Math.min(CARD_W + 20, window.innerWidth - 32) }),
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

      <div style={cardStyle}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {step + 1} of {steps.length}
        </div>
        <div style={{ marginBottom: '14px' }}>{steps[step].text}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span onClick={finish} style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
            Skip tour
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                style={{ height: '30px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}
              >
                Back
              </button>
            )}
            <button
              onClick={() => (last ? finish() : setStep(s => s + 1))}
              style={{ height: '30px', padding: '0 14px', background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              {last ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// Small "Take a tour" button for a form's header — brings the tour back any
// time after it has been dismissed.
export function TourButton({ onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: '30px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--action)',
        border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-md)', fontSize: '12px', fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap', ...style,
      }}
    >
      ? Take a tour
    </button>
  )
}
