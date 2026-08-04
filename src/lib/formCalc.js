import { getAdvanceFlags } from './approvalEngine'

// Indian fiscal year prefix (Apr–Mar), e.g. "26/27" — used in ID numbering
// (vendor/PR/PO) so all three share one convention: `{fy}-{TYPE}-07-{NNNN}`.
export function getFiscalYearPrefix() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return m >= 4
    ? `${String(y).slice(2)}/${String(y + 1).slice(2)}`
    : `${String(y - 1).slice(2)}/${String(y).slice(2)}`
}

// Amount breakdown: Base + Tax (mandatory) + Incidentals (optional) → computed Total.
// value = { base, tax, incidental }
export function breakdownTotals(value = {}) {
  const base       = Number(value.base) || 0
  const tax        = Number(value.tax) || 0
  const incidental = Number(value.incidental) || 0
  const total      = Math.round((base + tax + incidental) * 100) / 100
  // Valid when there's a positive base and a tax value has been entered (mandatory, may be 0 explicitly).
  const taxEntered = value.tax !== '' && value.tax != null
  const valid      = base > 0 && taxEntered
  return { base, tax, incidental, total, valid }
}

// Quote rows validity against the policy-required quote count.
// value = { quotes: [{ vendor_name, amount, quote_path, selected }], singleSource, singleSourceJustification }
export function quotesValidity(value = {}, requiredQuotes = 0) {
  const quotes = value.quotes || []
  const uploaded = quotes.filter(q => q.quote_path).length
  if (value.singleSource) {
    // Single source still needs its one quotation attached, not just a justification.
    return { valid: !!value.singleSourceJustification?.trim() && uploaded >= 1, uploaded }
  }
  const hasSelected = quotes.some(q => q.selected && q.quote_path)
  return { valid: uploaded >= requiredQuotes && hasSelected && !!value.comparative_statement_path, uploaded }
}

// Advance split validity. value = { advancePercent, flEmailAck }
export function advanceValidity(value = {}) {
  const advance = Number(value.advancePercent)
  const entered = value.advancePercent !== '' && value.advancePercent != null
  const { flaggedOver30, requiresFLEmail } = getAdvanceFlags(advance)
  const inRange = entered && advance >= 0 && advance <= 100
  const valid = inRange && (!requiresFLEmail || !!value.flEmailAck)
  return { advance: entered ? advance : 0, afterDelivery: entered ? 100 - advance : 100, flaggedOver30, requiresFLEmail, valid }
}
