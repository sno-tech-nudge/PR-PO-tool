// Converts a DD/MM/YYYY or DD-MM-YYYY string (what OCR extraction and most
// manual date fields in this app use) to the YYYY-MM-DD a native
// <input type="date"> requires. Passing through an already-ISO string is a
// no-op so this is safe to call on any date value regardless of source.
export function toInputDate(dateStr) {
  if (!dateStr) return ''
  const ddmm = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  const dash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  return ''
}

// Inverse of toInputDate — converts a native date input's YYYY-MM-DD value
// back to DD/MM/YYYY, this app's canonical stored date format.
export function fromInputDate(val) {
  if (!val) return ''
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return val
}
