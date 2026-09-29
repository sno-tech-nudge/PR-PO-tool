import { supabase } from './supabase'

// PostgREST rejects a single .in() filter outright (HTTP 400) once the
// value list gets long enough to blow its request-size limit — silently,
// from this code's point of view, since the query result is just `undefined`
// rather than a thrown error. 1000+ values (the scale this table reached
// once real historical POs were imported) reliably tips over it. Chunking
// keeps every individual request well under that ceiling; the results are
// merged back together as if it had been one query.
const IN_CHUNK_SIZE = 150

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function selectInChunks(table, select, column, values, extra) {
  if (!values.length) return []
  const results = await Promise.all(
    chunk(values, IN_CHUNK_SIZE).map(async part => {
      let q = supabase.from(table).select(select).in(column, part)
      if (extra) q = extra(q)
      const { data, error } = await q
      if (error) {
        console.error(`Batched ${table} query failed for a chunk:`, error)
        return []
      }
      return data || []
    })
  )
  return results.flat()
}

// Computes "amount still pending" for each PO in `pos` (each needs at least
// {id, po_number, amount}), batched across all of them in two queries
// instead of one pair of queries per PO — needed to show a real number next
// to every option in a PO dropdown (people often can't tell two POs with
// the same vendor apart by number alone) without firing N+1 requests.
// Mirrors the single-PO version already used when a specific PO is picked
// (ReportPreview.jsx's/ExpenseDetails.jsx's handleSelectPO, PODetail.jsx's
// pending-balance card).
export async function attachPendingBalances(pos) {
  if (!pos.length) return pos
  const ids = pos.map(p => p.id)
  const poNumbers = pos.map(p => p.po_number).filter(Boolean)
  const [reports, expenses] = await Promise.all([
    selectInChunks('expense_reports', 'po_id, total_amount, status', 'po_id', ids),
    selectInChunks('expense_details', 'po_number, amount', 'po_number', poNumbers, q => q.eq('status', 'saved')),
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
