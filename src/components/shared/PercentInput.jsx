import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'

// Percentage field: right-aligned monospace digits with a trailing "%"
// baked into the field itself, so the field reads as a percentage at a
// glance instead of needing a separate "%" label next to it.
export default function PercentInput({ value, onChange, placeholder = '0', error, style, inputStyle, max = 100, ...rest }) {
  function handleChange(raw) {
    let cleaned = sanitizeNumericValue(raw)
    // A percentage field is never legitimately over 100 — clamp rather than
    // let someone type 1000 and rely on downstream validation to quietly
    // treat it as 100 anyway, which just looks like a typo left on screen.
    if (max != null && cleaned !== '' && parseFloat(cleaned) > max) cleaned = String(max)
    onChange(cleaned)
  }
  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        type="text"
        inputMode="decimal"
        value={value ?? ''}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={blockNonNumericKey}
        onPaste={sanitizeNumericPaste}
        placeholder={placeholder}
        style={{
          width: '100%', height: '38px', border: `1px solid ${error ? 'var(--clay-text)' : 'var(--taupe-400)'}`,
          borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--ink)',
          background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
          ...inputStyle,
          // Always reserved for the trailing "%" and right-alignment — never
          // overridable by a caller's inputStyle, otherwise they overlap.
          padding: '0 22px 0 10px', textAlign: 'right', fontFamily: 'monospace',
        }}
        {...rest}
      />
      <span style={{
        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
        fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'monospace', pointerEvents: 'none',
      }}>
        %
      </span>
    </div>
  )
}
