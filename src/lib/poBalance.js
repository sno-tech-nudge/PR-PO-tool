import { supabase } from './supabase'

// Computes "amount still pending" for each PO in `pos` (each needs at least
// {id, po_number, amount}), batched across all of them in two queries
// instead of one pair of queries per PO — needed to show a real number next
// to every option in a PO dropdown (people often can't tell two POs with
// the same vendor apart by number alone) without firing N+1 requests.
// Mirrors the single-PO version already used when a specific PO is picked
// (ReportDetails.jsx's handleSelectPO, PODetail.jsx's pending-balance card).
export async function attachPendingBalances(pos) {
  if (!pos.length) return pos
  const ids = pos.map(p => p.id)
  const poNumbers = pos.map(p => p.po_number).filter(Boolean)
  const [{ data: reports }, { data: expenses }] = await Promise.all([
    supabase.from('expense_reports').select('po_id, total_amount, status').in('po_id', ids),
    supabase.from('expense_details').select('po_number, amount').in('po_number', poNumbers).eq('status', 'saved'),
  ])
  const reportsByPO = {}
  for (const r of reports || []) {
    if (r.status === 'rejected') continue
    reportsByPO[r.po_id] = (reportsByPO[r.po_id] || 0) + (Number(r.total_amount) || 0)
  }
  const expensesByPO = {}
  for (const e of expenses || []) {
    expensesByPO[e.po_number] = (expensesByPO[e.po_number] || 0) + (Number(e.amount) || 0)
  }
  return pos.map(po => {
    const claimed = (reportsByPO[po.id] || 0) + (expensesByPO[po.po_number] || 0)
    const pending = Math.max(0, (Number(po.amount) || 0) - claimed)
    return { ...po, pending }
  })
}

// Shared dropdown label — PO number, vendor, and pending balance, so two
// POs from the same vendor (or a number nobody remembers) are still
// distinguishable by how much is left on each.
export function poOptionLabel(po) {
  const vendor = po.vendors?.org_name ? ` — ${po.vendors.org_name}` : ''
  const pending = po.pending != null ? ` — ₹${Number(po.pending).toLocaleString('en-IN')} left` : ''
  return `${po.po_number}${vendor}${pending}`
}
