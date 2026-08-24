import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'

// Percentage field: right-aligned monospace digits with a trailing "%"
// baked into the field itself, so the field reads as a percentage at a
// glance instead of needing a separate "%" label next to it.
export default function PercentInput({ value, onChange, placeholder = '0', error, style, inputStyle, ...rest }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        type="text"
        inputMode="decimal"
        value={value ?? ''}
        onChange={e => onChange(sanitizeNumericValue(e.target.value))}
        onKeyDown={blockNonNumericKey}
        onPaste={sanitizeNumericPaste}
        placeholder={placeholder}
        style={{
          width: '100%', height: '38px', border: `1px solid ${error ? '#DC2626' : '#D1D5DB'}`,
          borderRadius: '4px', fontSize: '13px', color: '#1A1F36',
          background: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
          ...inputStyle,
          // Always reserved for the trailing "%" and right-alignment — never
          // overridable by a caller's inputStyle, otherwise they overlap.
          padding: '0 22px 0 10px', textAlign: 'right', fontFamily: 'monospace',
        }}
        {...rest}
      />
      <span style={{
        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
        fontSize: '13px', color: '#6B7280', fontFamily: 'monospace', pointerEvents: 'none',
      }}>
        %
      </span>
    </div>
  )
}
