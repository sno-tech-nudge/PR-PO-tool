// Live Indian-numbering (lakh/crore) thousands-grouping for a raw numeric
// string as typed — e.g. "100000" -> "1,00,000", "1234567.5" -> "12,34,567.5".
// Pure display formatting; the caller always keeps the unformatted raw
// string as the actual field value (see AmountInput).
export function formatIndianNumber(raw) {
  if (raw == null || raw === '') return ''
  const [intPart, decPart] = String(raw).split('.')
  const digits = intPart || ''
  let grouped
  if (digits.length <= 3) {
    grouped = digits
  } else {
    const last3 = digits.slice(-3)
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    grouped = `${rest},${last3}`
  }
  return decPart != null ? `${grouped}.${decPart}` : grouped
}
