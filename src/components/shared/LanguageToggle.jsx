import { useSyncExternalStore } from 'react'
import { getLang, setLang, subscribeLang } from '../../lib/i18n/engine'

// Small "A/अ" button — English and Hindi glyphs side by side so it reads as a
// language switch in either language. English by default; one click switches
// the forms to Hindi, another click goes back. `tone="dark"` is for the dark
// sidebar, `tone="light"` for light headers (the public vendor page).
export default function LanguageToggle({ tone = 'dark', style }) {
  const lang = useSyncExternalStore(subscribeLang, getLang)
  const isHindi = lang === 'hi'
  const dark = tone === 'dark'

  return (
    <button
      type="button"
      onClick={() => setLang(isHindi ? 'en' : 'hi')}
      aria-label={isHindi ? 'Switch to English' : 'हिन्दी में बदलें'}
      title={isHindi ? 'Switch to English' : 'हिन्दी में बदलें'}
      translate="no"
      style={{
        minWidth: '44px', height: dark ? '28px' : '32px', padding: '0 10px',
        background: isHindi ? (dark ? 'rgba(232,160,144,0.25)' : 'var(--action-bg)') : 'transparent',
        border: dark ? '1px solid rgba(196,130,111,0.35)' : '1px solid var(--taupe-400)',
        color: dark ? 'var(--text-on-dark-muted)' : 'var(--action)',
        borderRadius: 'var(--radius-md)', fontSize: '12px', fontWeight: 700,
        cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em',
        ...style,
      }}
    >
      A/अ
    </button>
  )
}
