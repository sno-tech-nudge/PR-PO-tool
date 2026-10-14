import { useState } from 'react'

// Tap-to-choose reasons with an "Other" box as the last resort. The value is
// the chosen reason as plain text ("Other: ..." when typed), so it can be
// stored and read back as it is.
export default function ReasonChips({ options, value, onChange }) {
  const isOther = typeof value === 'string' && value.startsWith('Other')
  const [showOther, setShowOther] = useState(isOther)
  const otherText = isOther ? value.replace(/^Other:?\s*/, '') : ''

  const chip = active => ({
    padding: '6px 11px', fontSize: '12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
    border: `1px solid ${active ? 'var(--gold-text)' : 'var(--gold-border)'}`,
    background: active ? 'var(--gold-text)' : 'var(--surface-card)',
    color: active ? 'var(--surface-card)' : 'var(--gold-text)',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {options.map(o => (
          <div key={o} role="button" onClick={() => { setShowOther(false); onChange(value === o ? '' : o) }} style={chip(value === o)}>{o}</div>
        ))}
        <div role="button" onClick={() => { setShowOther(true); if (!isOther) onChange('Other') }} style={chip(showOther)}>Other</div>
      </div>
      {showOther && (
        <input
          type="text"
          value={otherText}
          onChange={e => onChange(e.target.value ? `Other: ${e.target.value}` : 'Other')}
          placeholder="A few words"
          autoFocus
          style={{ marginTop: '8px', width: '100%', boxSizing: 'border-box', height: '36px', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: 'var(--surface-card)' }}
        />
      )}
    </div>
  )
}
