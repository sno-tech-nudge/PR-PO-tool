import { supabase } from './supabase'
import { OTHER_CATEGORY } from './expenseCategories'

// How a vendor invoice splits into line items (each taxed by its own category),
// incidentals and GST. Only the line items carry TDS; GST and incidentals never
// do. Total = line items + incidentals + GST.

const num = v => Number(v) || 0
const round2 = n => Math.round(n * 100) / 100
const money = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

// A purchase request's line items, grouped by category and scaled to what this
// invoice is worth against the whole request (so a part payment or an advance
// splits in the same proportions). Null when the request has no line items.
export function splitFromPr(pr, invoiceAmount) {
  const items = Array.isArray(pr?.line_items) ? pr.line_items : []
  if (!items.length) return null
  const byCategory = new Map()
  const whatOther = new Set()
  for (const it of items) {
    const cat = it.category || ''
    byCategory.set(cat, (byCategory.get(cat) || 0) + num(it.quantity) * num(it.rate_per_unit))
    if (cat === OTHER_CATEGORY && String(it.description || '').trim()) whatOther.add(String(it.description).trim())
  }
  const prBase = [...byCategory.values()].reduce((s, v) => s + v, 0)
  if (!(prBase > 0)) return null
  const scale = num(pr.amount) > 0 && num(invoiceAmount) > 0 ? num(invoiceAmount) / num(pr.amount) : 1
  const lines = [...byCategory.entries()].map(([category, amount]) => ({
    category, amount: round2(amount * scale), other: category === OTHER_CATEGORY ? [...whatOther].join('; ').slice(0, 80) : '',
  }))
  // Keep the lines adding up to the scaled base despite rounding.
  const drift = round2(prBase * scale - lines.reduce((s, l) => s + l.amount, 0))
  if (drift) lines[lines.length - 1].amount = round2(lines[lines.length - 1].amount + drift)
  return {
    lines,
    gst: round2(num(pr.tax_amount ?? pr.gst_amount) * scale),
    incidental: round2(num(pr.incidental_amount) * scale),
  }
}

// The split to show or edit for one vendor line, with where it came from.
export function deriveSplit(expense, pr) {
  if (Array.isArray(expense?.tds_breakdown) && expense.tds_breakdown.length) {
    return {
      source: 'saved',
      lines: expense.tds_breakdown.map(b => ({ category: b.category || '', amount: num(b.amount), other: b.other || '' })),
      gst: num(expense.gst_amount), incidental: num(expense.other_amount), hint: null,
    }
  }
  const fromPr = splitFromPr(pr, expense?.amount)
  if (fromPr) {
    return { source: 'pr', ...fromPr, hint: 'Filled in from the purchase request, scaled to this invoice. Change anything that differs from the bill.' }
  }
  if (Array.isArray(expense?.itemized_lines) && expense.itemized_lines.some(l => num(l.amount) > 0)) {
    return {
      source: 'itemized',
      lines: expense.itemized_lines.filter(l => num(l.amount) > 0).map(l => ({ category: l.category || '', amount: num(l.amount), other: l.other || '' })),
      gst: num(expense.gst_amount), incidental: 0, hint: 'Filled in from the items the employee listed.',
    }
  }
  const cats = String(pr?.category || '').split(',').map(c => c.trim()).filter(Boolean)
  return {
    source: 'single',
    lines: [{ category: expense?.category || '', amount: num(expense?.base_amount) || num(expense?.amount), other: expense?.category === OTHER_CATEGORY ? (expense?.sub_category || '') : '' }],
    gst: num(expense?.gst_amount), incidental: 0,
    hint: cats.length > 1 ? `The purchase request covers ${cats.join(', ')}. Add a line for each so each is taxed by its own category.` : null,
  }
}

// The purchase request behind each PO invoice line, keyed by PO number.
export async function loadPrsByPoNumber(expenses) {
  const poNumbers = [...new Set((expenses || []).map(e => e.po_number).filter(Boolean))]
  if (!poNumbers.length) return {}
  try {
    const { data: pos } = await supabase.from('purchase_orders').select('po_number, pr_id').in('po_number', poNumbers)
    const prIds = [...new Set((pos || []).map(p => p.pr_id).filter(Boolean))]
    if (!prIds.length) return {}
    const { data: prs } = await supabase.from('purchase_requests').select('id, amount, category, base_amount, tax_amount, gst_amount, incidental_amount, line_items').in('id', prIds)
    const byId = Object.fromEntries((prs || []).map(p => [p.id, p]))
    return Object.fromEntries((pos || []).filter(p => byId[p.pr_id]).map(p => [p.po_number, byId[p.pr_id]]))
  } catch {
    return {}
  }
}

// A split line's category, with what "Other" is when it was given: "Other (stage hire)".
export function lineLabel(l) {
  const cat = l?.category || 'No category'
  const what = String(l?.other || '').trim()
  return cat === OTHER_CATEGORY && what ? `${cat} (${what})` : cat
}

// One line of plain text for exports: "Rent ₹5,000 (194I 10%: ₹500); ...; Incidentals ₹200; GST ₹1,800".
export function describeSplit(expense) {
  const lines = Array.isArray(expense?.tds_breakdown) ? expense.tds_breakdown : []
  if (!lines.length) return ''
  const parts = lines.map(l => `${lineLabel(l)} ${money(l.amount)}${l.section && num(l.tds) > 0 ? ` (${l.section} ${l.rate}%: ${money(l.tds)})` : ' (no TDS)'}`)
  if (num(expense.other_amount) > 0) parts.push(`Incidentals ${money(expense.other_amount)}`)
  if (num(expense.gst_amount) > 0) parts.push(`GST ${money(expense.gst_amount)}`)
  return parts.join('; ')
}
