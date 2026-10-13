import { supabase } from './supabase'
import { toInputDate } from './dateFormat'
import { getDisplayName } from './directory'

// The amounts the policy treats as approval thresholds (the same two the
// policy engine watches). Several bills from the same vendor on the same day
// that together cross one of them, while each stays under it, are worth a look.
export const SPLIT_THRESHOLDS = [
  { amount: 50000, label: '₹50,000' },
  { amount: 200000, label: '₹2,00,000' },
]

const COLUMNS = 'id, vendor, amount, date, invoice_number, capture_id, user_email, report_id, status'

function vendorKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|the|and|co|company)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '')
}
function sameVendor(a, b) {
  const x = vendorKey(a)
  const y = vendorKey(b)
  if (!x || !y) return false
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))
}
const dayOf = d => toInputDate(String(d || '').trim()) || ''
const invoiceKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`

// Looks across everyone's expenses, not just this report's, for:
//   same_receipt  the same receipt image filed again
//   same_invoice  the same invoice number from the same vendor
//   same_bill     the same vendor, amount and date
// and, per report, for split bills (see SPLIT_THRESHOLDS).
// Returns { byExpense: { [expenseId]: [signal] }, split: [group] }.
// Never throws: if anything fails the checklist just shows no signals.
export async function findDuplicateSignals(report, expenses) {
  const byExpense = {}
  const add = (id, signal) => { (byExpense[id] ||= []).push(signal) }
  const split = []
  try {
    if (!expenses?.length) return { byExpense, split }
    const ownIds = new Set(expenses.map(e => e.id))

    // Where did the other expense come from? A report reference if it is in one.
    async function describeOthers(rows) {
      const ids = rows.map(r => r.id)
      const refByExpense = {}
      if (ids.length) {
        const { data: links } = await supabase.from('report_expenses').select('expense_id, report_id').in('expense_id', ids)
        const reportIds = [...new Set((links || []).map(l => l.report_id))]
        const { data: reps } = reportIds.length
          ? await supabase.from('expense_reports').select('id, report_reference, status').in('id', reportIds)
          : { data: [] }
        const repById = Object.fromEntries((reps || []).map(r => [r.id, r]))
        for (const l of links || []) {
          const rep = repById[l.report_id]
          if (rep && !refByExpense[l.expense_id]) refByExpense[l.expense_id] = rep.report_reference
        }
      }
      return row => ({
        id: row.id,
        ref: ownIds.has(row.id) ? 'this report' : (refByExpense[row.id] || 'saved, not in a report'),
        sameReport: ownIds.has(row.id),
        who: row.user_email ? getDisplayName(row.user_email) : null,
        vendor: row.vendor, amount: row.amount, date: row.date,
      })
    }
    const whereText = o => `${o.who ? `${o.who}, ` : ''}${o.ref === 'this report' ? 'also in this report' : o.ref}`

    // --- candidates: same amount, same invoice number, same receipt image ---
    const amounts = [...new Set(expenses.map(e => Number(e.amount)).filter(a => a > 0))]
    const invoices = [...new Set(expenses.map(e => (e.invoice_number || '').trim()).filter(Boolean))]
    const captureIds = [...new Set(expenses.map(e => e.capture_id).filter(Boolean))]

    const [amountRes, invoiceRes, ownCaps] = await Promise.all([
      amounts.length ? supabase.from('expense_details').select(COLUMNS).in('amount', amounts) : { data: [] },
      invoices.length ? supabase.from('expense_details').select(COLUMNS).in('invoice_number', invoices) : { data: [] },
      captureIds.length ? supabase.from('expense_captures').select('id, receipt_hash').in('id', captureIds) : { data: [] },
    ])

    const hashByCapture = Object.fromEntries((ownCaps.data || []).filter(c => c.receipt_hash).map(c => [c.id, c.receipt_hash]))
    const hashes = [...new Set(Object.values(hashByCapture))]
    let sameHashRows = []
    if (hashes.length) {
      const { data: caps } = await supabase.from('expense_captures').select('id, receipt_hash').in('receipt_hash', hashes)
      const capIds = (caps || []).map(c => c.id)
      if (capIds.length) {
        const { data } = await supabase.from('expense_details').select(COLUMNS).in('capture_id', capIds)
        sameHashRows = (data || []).map(r => ({ ...r, _hash: (caps || []).find(c => c.id === r.capture_id)?.receipt_hash }))
      }
    }

    const candidates = new Map()
    for (const r of [...(amountRes.data || []), ...(invoiceRes.data || []), ...sameHashRows]) candidates.set(r.id, r)
    const describe = await describeOthers([...candidates.values()])

    const seen = new Set() // expenseId|otherId|kind, so a pair is reported once per kind
    for (const exp of expenses) {
      const day = dayOf(exp.date)
      for (const other of candidates.values()) {
        if (other.id === exp.id) continue
        const o = describe(other)

        const sameImage = exp.capture_id && hashByCapture[exp.capture_id]
          && sameHashRows.some(r => r.id === other.id && r._hash === hashByCapture[exp.capture_id])
        const sameInvoice = invoiceKey(exp.invoice_number).length >= 3
          && invoiceKey(exp.invoice_number) === invoiceKey(other.invoice_number)
          && (sameVendor(exp.vendor, other.vendor) || Math.abs(Number(exp.amount) - Number(other.amount)) < 1)
        const sameBill = Math.abs(Number(exp.amount) - Number(other.amount)) < 1
          && sameVendor(exp.vendor, other.vendor)
          && day && day === dayOf(other.date)

        const push = (kind, text) => {
          const key = `${exp.id}|${other.id}|${kind}`
          if (seen.has(key)) return
          seen.add(key)
          add(exp.id, { kind, severity: 'high', text, other: o })
        }
        if (sameImage) push('same_receipt', `The same receipt image was filed for ${other.vendor || 'another expense'} ${money(other.amount)} (${whereText(o)}).`)
        if (sameInvoice) push('same_invoice', `Invoice ${exp.invoice_number} from ${other.vendor || 'this vendor'} was also filed (${whereText(o)}).`)
        if (sameBill && !sameImage && !sameInvoice) push('same_bill', `Same vendor, amount and date as ${other.vendor || 'another expense'} ${money(other.amount)} (${whereText(o)}).`)
      }
    }

    // --- split bills: this employee, same vendor, same day, across all reports ---
    const employee = report?.employee_email || expenses[0]?.user_email
    if (employee) {
      const { data: mine } = await supabase.from('expense_details').select(COLUMNS).eq('user_email', employee).limit(3000)
      const pool = new Map()
      for (const r of [...(mine || []), ...expenses]) pool.set(r.id, r)
      const groups = new Map()
      for (const r of pool.values()) {
        const d = dayOf(r.date)
        const vk = vendorKey(r.vendor)
        if (!d || !vk || !(Number(r.amount) > 0)) continue
        const key = `${vk}|${d}`
        groups.set(key, [...(groups.get(key) || []), r])
      }
      for (const bills of groups.values()) {
        if (bills.length < 2 || !bills.some(b => ownIds.has(b.id))) continue
        const total = bills.reduce((s, b) => s + Number(b.amount || 0), 0)
        const biggest = Math.max(...bills.map(b => Number(b.amount || 0)))
        // The threshold the combined total crosses while no single bill does.
        const crossed = [...SPLIT_THRESHOLDS].reverse().find(t => total >= t.amount && biggest < t.amount)
        if (!crossed) continue
        const group = {
          vendor: bills[0].vendor, date: bills[0].date, total, threshold: crossed,
          bills: bills.map(b => ({ id: b.id, amount: Number(b.amount), inThisReport: ownIds.has(b.id) })),
        }
        split.push(group)
        const text = `${bills.length} bills from ${group.vendor || 'the same vendor'} on ${group.date} add up to ${money(total)}, over ${crossed.label}, though each is under it.`
        bills.filter(b => ownIds.has(b.id)).forEach(b => add(b.id, { kind: 'split', severity: 'medium', text, group }))
      }
    }
  } catch (err) {
    console.error('duplicate check failed:', err)
  }
  return { byExpense, split }
}
