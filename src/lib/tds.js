import { supabase } from './supabase'
import { toInputDate } from './dateFormat'
import { sameVendor } from './duplicateCheck'

// Automatic TDS for vendor payments. The rules live in the tds_rules table
// (Settings > TDS rules), which the Finance team owns; this file only applies
// them. Every vendor line ends up with a status: applicable, not applicable
// (with the reason), or needing a look, so none slips through unscanned.

export async function loadTdsRules() {
  const { data } = await supabase.from('tds_rules').select('*').eq('active', true).order('section', { ascending: true })
  return data || []
}

// The fourth letter of a PAN is the holder type: P person, H HUF, and the rest
// (company, firm, trust, ...) are other payees.
export function payeeTypeFromPan(pan) {
  const p = String(pan || '').toUpperCase().trim()
  if (p.length !== 10) return null
  return p[3] === 'P' || p[3] === 'H' ? 'individual' : 'other'
}

const dayOf = d => toInputDate(String(d || '').trim()) || ''

// Financial year (April to March) of a date, as its starting year.
export function fyStartYear(dateStr) {
  const iso = dayOf(dateStr)
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date()
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
}

const money = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

// Pure calculation. `base` is the amount before GST and incidentals; `ytdBase`
// is what was already paid to the same vendor earlier in the financial year.
export function computeTds({ rules, category, pan, base, ytdBase = 0 }) {
  const b = Number(base) || 0
  if (!(b > 0)) return { status: 'review', section: null, rate: null, amount: 0, note: 'Enter the base amount to work out TDS.' }

  const payee = payeeTypeFromPan(pan)
  const hasPan = payee !== null
  const covering = (rules || []).filter(r => (r.categories || []).includes(category))
  if (!covering.length) {
    return { status: 'not_applicable', section: null, rate: null, amount: 0, note: `No TDS rule covers "${category || 'this category'}".` }
  }
  // A rule for this payee type, or one for any payee; with no PAN on record the
  // payee type is unknown, so the rule meant for "others" is used.
  const rule = covering.find(r => r.payee_type === (payee || 'other')) || covering.find(r => r.payee_type === 'any') || covering[0]

  const single = rule.single_threshold != null ? Number(rule.single_threshold) : null
  const annual = rule.annual_threshold != null ? Number(rule.annual_threshold) : null
  const total = (Number(ytdBase) || 0) + b
  const overSingle = single != null && b > single
  const overAnnual = annual != null && total > annual
  if (!overSingle && !overAnnual) {
    const bits = []
    if (single != null) bits.push(`${money(single)} on one bill`)
    if (annual != null) bits.push(`${money(annual)} in the year (${money(total)} so far)`)
    return { status: 'not_applicable', section: rule.section, rate: Number(rule.rate), amount: 0, note: `Below the ${rule.section} limit of ${bits.join(' or ')}.`, rule }
  }

  // On the payment that crosses the yearly limit, tax is due on everything paid
  // so far this year, not just this bill.
  const catchUp = !overSingle && overAnnual && Number(ytdBase) > 0 && Number(ytdBase) <= annual
  const taxable = catchUp ? total : b
  const rate = hasPan ? Number(rule.rate) : Math.max(Number(rule.rate), Number(rule.no_pan_rate || 20))
  const amount = Math.round((taxable * rate) / 100)
  const why = overSingle ? `this bill is over ${money(single)}` : `payments this year reach ${money(total)}, over ${money(annual)}`
  return {
    status: 'applicable', section: rule.section, rate, amount, rule,
    note: `${rule.section} at ${rate}% on ${money(taxable)} because ${why}.${catchUp ? ' This includes earlier payments this year.' : ''}${hasPan ? '' : ' No PAN is on record, so the higher rate applies.'}`,
  }
}

// What the same vendor has already been paid this financial year across
// submitted vendor reports, before this line. Uses the base amount where it was
// recorded and the full amount otherwise.
export async function vendorYtdBase(expense) {
  try {
    const fy = fyStartYear(expense.date)
    let q = supabase.from('expense_details').select('id, vendor, vendor_id, date, amount, base_amount, report_id, status').eq('status', 'reported').neq('id', expense.id)
    q = expense.vendor_id ? q.eq('vendor_id', expense.vendor_id) : q.ilike('vendor', `%${String(expense.vendor || '').replace(/[%,()]/g, ' ').trim()}%`)
    const { data } = await q.limit(2000)
    const rows = (data || []).filter(r => fyStartYear(r.date) === fy && (expense.vendor_id || sameVendor(r.vendor, expense.vendor)))
    const reportIds = [...new Set(rows.map(r => r.report_id).filter(Boolean))]
    if (!reportIds.length) return 0
    const { data: reps } = await supabase.from('expense_reports').select('id, payment_kind').in('id', reportIds)
    const vendorReports = new Set((reps || []).filter(r => r.payment_kind === 'vendor').map(r => r.id))
    return rows.filter(r => vendorReports.has(r.report_id)).reduce((s, r) => s + (Number(r.base_amount) || Number(r.amount) || 0), 0)
  } catch {
    return 0
  }
}
