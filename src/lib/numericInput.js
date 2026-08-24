// Native <input type="number"> still lets the keyboard type 'e', 'E', '+',
// '-' (valid for scientific notation) and lets a paste drop in any text at
// all — both read as "alphabets in an amount field" to a user. These two
// handlers close both gaps while still allowing digits, one decimal point,
// and normal editing/navigation keys. Wire both onto any amount/quantity/
// percentage <input type="number">: onKeyDown={blockNonNumericKey}
// onPaste={sanitizeNumericPaste}.

const ALLOWED_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End',
])

export function blockNonNumericKey(e) {
  if (e.ctrlKey || e.metaKey) return // allow copy/paste/select-all/undo shortcuts
  if (ALLOWED_KEYS.has(e.key)) return
  if (e.key === '.' && !e.target.value.includes('.')) return
  if (/^[0-9]$/.test(e.key)) return
  e.preventDefault()
}

// Backstop for onChange: strips anything that isn't a digit or a single
// decimal point, regardless of how it got into the field (paste, drag-drop,
// IME, autofill, or browser-native number-input quirks like 'e'/'+'/'-').
// Use as onChange={e => onChange(sanitizeNumericValue(e.target.value))} —
// the keydown/paste guards above give clean UX for normal typing, this
// guarantees correctness no matter the input path.
export function sanitizeNumericValue(raw) {
  if (raw == null) return raw
  let cleaned = String(raw).replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  return cleaned
}

export function sanitizeNumericPaste(e) {
  const text = e.clipboardData.getData('text')
  if (/^[0-9]*\.?[0-9]*$/.test(text)) return // already clean, let the default paste happen
  e.preventDefault()
  const cleaned = text.replace(/[^0-9.]/g, '')
  const input = e.target
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  const next = input.value.slice(0, start) + cleaned + input.value.slice(end)
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  nativeSetter.call(input, next)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
