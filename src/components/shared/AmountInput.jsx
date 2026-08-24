import { useRef, useLayoutEffect } from 'react'
import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'
import { formatIndianNumber } from '../../lib/numberFormat'

// Currency field: fixed ₹ prefix, right-aligned monospace digits, and a
// live Indian-grouped display (1,00,000) while typing. The value passed to
// onChange is always the raw undecorated digit string (e.g. "100000") —
// every existing caller/validator that reads/writes this value keeps
// working completely unchanged; only the on-screen text is formatted.
export default function AmountInput({ value, onChange, placeholder = '0', error, style, inputStyle, ...rest }) {
  const inputRef = useRef(null)
  const pendingCaretDigits = useRef(null)
  const displayValue = formatIndianNumber(value ?? '')

  // After a re-render with the freshly formatted text, put the caret back
  // at the same position *relative to the digits typed* rather than the
  // same raw character index — comma insertion/removal otherwise shoves
  // the caret to the wrong place as you type in the middle of a number.
  useLayoutEffect(() => {
    if (pendingCaretDigits.current == null || !inputRef.current) return
    const target = pendingCaretDigits.current
    pendingCaretDigits.current = null
    if (target === 0) { inputRef.current.setSelectionRange(0, 0); return }
    let seen = 0
    let pos = displayValue.length
    for (let i = 0; i < displayValue.length; i++) {
      if (/[0-9]/.test(displayValue[i])) seen++
      if (seen === target) { pos = i + 1; break }
    }
    inputRef.current.setSelectionRange(pos, pos)
  }, [displayValue])

  function handleChange(e) {
    const raw = e.target.value
    const caret = e.target.selectionStart ?? raw.length
    pendingCaretDigits.current = raw.slice(0, caret).replace(/[^0-9]/g, '').length
    onChange(sanitizeNumericValue(raw))
  }

  return (
    <div style={{ position: 'relative', ...style }}>
      <span style={{
        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
        fontSize: '13px', color: '#6B7280', fontFamily: 'monospace', pointerEvents: 'none',
      }}>
        ₹
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={blockNonNumericKey}
        onPaste={sanitizeNumericPaste}
        placeholder={placeholder}
        style={{
          width: '100%', height: '38px', border: `1px solid ${error ? '#DC2626' : '#D1D5DB'}`,
          borderRadius: '4px', fontSize: '13px', color: '#1A1F36',
          background: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
          ...inputStyle,
          // Always reserved for the ₹ prefix and right-alignment — never
          // overridable by a caller's inputStyle, otherwise the prefix and
          // the digits overlap.
          padding: '0 10px 0 24px', textAlign: 'right', fontFamily: 'monospace',
        }}
        {...rest}
      />
    </div>
  )
}
