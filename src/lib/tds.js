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

// The rule that covers a category for this kind of payee, or null. A rule for
// the payee type wins over one for any payee; with no PAN on record the payee
// type is unknown, so the rule meant for "others" is used.
function pickRule(rules, category, payee) {
  const covering = (rules || []).filter(r => (r.categories || []).includes(category))
  if (!covering.length) return null
  return covering.find(r => r.payee_type === (payee || 'other')) || covering.find(r => r.payee_type === 'any') || covering[0]
}

// Pure calculation. `base` is the amount before GST and incidentals; `ytdBase`
// is what was already paid to the same vendor earlier in the financial year.
export function computeTds({ rules, category, pan, base, ytdBase = 0 }) {
  const b = Number(base) || 0
  if (!(b > 0)) return { status: 'review', section: null, rate: null, amount: 0, note: 'Enter the base amount to work out TDS.' }

  const payee = payeeTypeFromPan(pan)
  const rule = pickRule(rules, category, payee)
  if (!rule) {
    return { status: 'not_applicable', section: null, rate: null, amount: 0, note: `No TDS rule covers "${category || 'this category'}".` }
  }
  return evaluateRule(rule, b, ytdBase, payee !== null)
}

// One rule applied to an amount: is it over the limits, at what rate, how much.
function evaluateRule(rule, b, ytdBase, hasPan) {
  const single = rule.single_threshold != null ? Number(rule.single_threshold) : null
  const annual = rule.annual_threshold != null ? Number(rule.annual_threshold) : null
  const total = (Number(ytdBase) || 0) + b
  // A rule with neither limit set applies to every bill (as Settings says); only
  // a rule that has a limit can be "below" it.
  const noLimit = single == null && annual == null
  const overSingle = single != null && b > single
  const overAnnual = annual != null && total > annual
  if (!noLimit && !overSingle && !overAnnual) {
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
  const why = noLimit ? '' : overSingle ? ` because this bill is over ${money(single)}` : ` because payments this year reach ${money(total)}, over ${money(annual)}`
  return {
    status: 'applicable', section: rule.section, rate, amount, rule,
    note: `${rule.section} at ${rate}% on ${money(taxable)}${why}.${catchUp ? ' This includes earlier payments this year.' : ''}${hasPan ? '' : ' No PAN is on record, so the higher rate applies.'}`,
  }
}

// Spreads a total across weights so the parts add up to it exactly.
function allocate(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (!(sum > 0) || !total) return weights.map(() => 0)
  const parts = weights.map(w => Math.round((total * w) / sum))
  const diff = total - parts.reduce((s, p) => s + p, 0)
  if (diff) parts[weights.indexOf(Math.max(...weights))] += diff
  return parts
}

// TDS for an invoice whose line items fall under different categories, each
// with its own rule (for example rent at one rate, a contract at another).
// Only the line items are taxed: GST and incidentals are never part of the base.
// Lines that fall under the same rule are added together before that rule's
// limits are checked, because the limit is per bill, not per line.
// `pieces` is what the vendor was paid earlier this year, as { category, base }.
export function computeTdsSplit({ rules, lines, pan, pieces = [] }) {
  const items = (lines || []).map(l => ({ category: l.category || '', other: l.other || '', amount: Number(l.amount) || 0 })).filter(l => l.amount > 0)
  const base = items.reduce((s, l) => s + l.amount, 0)
  if (!(base > 0)) return { status: 'review', section: null, rate: null, amount: 0, base: 0, lines: [], note: 'Enter the line items to work out TDS.' }

  const payee = payeeTypeFromPan(pan)
  const hasPan = payee !== null
  const groups = new Map()
  const results = items.map(l => ({ category: l.category, other: l.other, amount: l.amount, status: 'not_applicable', section: null, rate: null, tds: 0, note: '' }))
  items.forEach((l, i) => {
    const rule = pickRule(rules, l.category, payee)
    if (!rule) { results[i].note = `No TDS rule covers "${l.category || 'this category'}".`; return }
    const key = rule.id ?? `${rule.section}|${rule.label}`
    if (!groups.has(key)) groups.set(key, { rule, idx: [], base: 0 })
    const g = groups.get(key)
    g.idx.push(i); g.base += l.amount
  })

  const notes = []
  const applicable = []
  let total = 0
  for (const g of groups.values()) {
    const ytd = (pieces || []).filter(p => (g.rule.categories || []).includes(p.category)).reduce((s, p) => s + (Number(p.base) || 0), 0)
    const r = evaluateRule(g.rule, g.base, ytd, hasPan)
    const shares = allocate(r.amount, g.idx.map(i => results[i].amount))
    g.idx.forEach((i, k) => { Object.assign(results[i], { status: r.status, section: r.section, rate: r.rate, tds: shares[k], note: r.note }) })
    total += r.amount
    notes.push(r.note)
    if (r.status === 'applicable') applicable.push(r)
  }
  for (const r of results) if (!r.section && r.note) notes.push(r.note)

  const sections = [...new Set((applicable.length ? applicable : [...groups.values()].map(g => ({ section: g.rule.section }))).map(r => r.section))]
  return {
    status: total > 0 ? 'applicable' : 'not_applicable',
    section: sections.join(', ') || null,
    rate: applicable.length === 1 ? applicable[0].rate : null,
    amount: total, base, lines: results,
    note: notes.join(' '),
  }
}

// What the same vendor has already been paid this financial year across
// submitted vendor reports, before this line, as { category, base } pieces so a
// rule's yearly limit counts only what falls under that rule. Uses the base
// amount where it was recorded and the full amount otherwise.
export async function vendorYtdPieces(expense) {
  try {
    const fy = fyStartYear(expense.date)
    let q = supabase.from('expense_details').select('id, vendor, vendor_id, date, category, amount, base_amount, tds_breakdown, report_id, status').eq('status', 'reported').neq('id', expense.id)
    q = expense.vendor_id ? q.eq('vendor_id', expense.vendor_id) : q.ilike('vendor', `%${String(expense.vendor || '').replace(/[%,()]/g, ' ').trim()}%`)
    const { data } = await q.limit(2000)
    const rows = (data || []).filter(r => fyStartYear(r.date) === fy && (expense.vendor_id || sameVendor(r.vendor, expense.vendor)))
    const reportIds = [...new Set(rows.map(r => r.report_id).filter(Boolean))]
    if (!reportIds.length) return []
    const { data: reps } = await supabase.from('expense_reports').select('id, payment_kind').in('id', reportIds)
    const vendorReports = new Set((reps || []).filter(r => r.payment_kind === 'vendor').map(r => r.id))
    // A line that was split by category counts under each of its categories.
    return rows.filter(r => vendorReports.has(r.report_id)).flatMap(r => (
      Array.isArray(r.tds_breakdown) && r.tds_breakdown.length
        ? r.tds_breakdown.map(b => ({ category: b.category, base: Number(b.amount) || 0 }))
        : [{ category: r.category, base: Number(r.base_amount) || Number(r.amount) || 0 }]
    ))
  } catch {
    return []
  }
}

// The same figure as one number, for places that do not care about categories.
export async function vendorYtdBase(expense) {
  return (await vendorYtdPieces(expense)).reduce((s, p) => s + p.base, 0)
}
