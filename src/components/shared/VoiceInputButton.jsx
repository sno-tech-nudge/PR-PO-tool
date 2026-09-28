import { useEffect, useRef } from 'react'
import { useVoiceDictation } from '../../hooks/useVoiceDictation'

// Mic button for live voice-to-text dictation into a text field — the field
// itself is kept live/correct the whole time (see useVoiceDictation), so
// this component is just the trigger + the "listening" floating panel.
// Renders nothing at all when the browser has no SpeechRecognition support,
// matching this app's existing best-effort AI features (no disabled state
// to explain, it simply isn't there).
//
// Same floating-panel recipe as InfoTip.jsx/VendorColumnPicker.jsx —
// position:relative wrapper, position:absolute panel, a full-screen
// click-catcher for outside-click dismissal.
export default function VoiceInputButton({ value, onChange, maxLength, lang }) {
  const { supported, listening, error, start, finish, cancel } = useVoiceDictation({ value, onChange, maxLength, lang })
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!listening) return
    function handleKey(e) {
      if (e.key === 'Escape') finish()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [listening, finish])

  if (!supported) return null

  return (
    <span ref={wrapRef} style={{ position: 'absolute', top: '50%', right: '8px', transform: 'translateY(-50%)', zIndex: 5 }}>
      <button
        type="button"
        onClick={listening ? undefined : start}
        aria-label={listening ? 'Listening' : 'Dictate with voice'}
        style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          border: 'none', background: listening ? 'var(--clay-text)' : 'transparent',
          color: listening ? 'var(--surface-card)' : 'var(--action)',
          cursor: listening ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      {listening && (
        <>
          <div onClick={finish} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div
            style={{
              position: 'absolute', right: 0, top: '30px', zIndex: 100,
              width: '180px', background: 'var(--surface-card)', border: '1px solid var(--taupe-200)',
              borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(54, 32, 26,0.12)',
              padding: '12px', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Listening…</div>
            <button
              type="button"
              onClick={finish}
              aria-label="Stop speaking"
              style={{
                width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                background: 'var(--clay-text)', color: 'var(--surface-card)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px',
              }}
            >
              <span style={{ width: '13px', height: '13px', background: 'var(--surface-card)', borderRadius: '2px' }} />
            </button>
            <span
              onClick={cancel}
              style={{ fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer' }}
            >
              Cancel
            </span>
          </div>
        </>
      )}

      {!listening && error && (
        <div
          style={{
            position: 'absolute', right: 0, top: '30px', zIndex: 100,
            width: 'max-content', maxWidth: '200px',
            background: 'var(--clay-bg)', border: '1px solid var(--clay-border)',
            borderRadius: 'var(--radius-sm)', padding: '8px 10px',
            fontSize: '11px', color: 'var(--clay-text)', lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </span>
  )
}
