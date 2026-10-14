import { supabase } from './supabase'

// Advances as running balances. An advance is money already paid to an employee;
// every report that settles against it takes some of it, and what is left is the
// advance minus those amounts. One report can draw on several advances and one
// advance can be drawn on by several reports (see report_advances).

// Reports that count against an advance as soon as they are submitted, so the
// balance an employee sees already allows for reports still awaiting approval.
const COUNTED = ['submitted', 'under_review', 'approved', 'processing', 'reimbursed']

export const money = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

// The employee's paid-out advances, oldest first, each with what has been used
// and what is left. `excludeReportId` leaves out the report being worked on so
// its own earlier figures are not counted twice.
export async function loadAdvanceBalances(emails, { excludeReportId = null } = {}) {
  const list = (emails || []).filter(Boolean)
  if (!list.length) return []
  const { data: advances } = await supabase
    .from('advances')
    .select('id, requested_by, amount, description, expected_usage_date, recorded_at, created_at')
    .in('requested_by', list)
    .eq('status', 'recorded')
    .order('recorded_at', { ascending: true })
  return withBalances(advances || [], { excludeReportId })
}

// The same figures for advances already in hand (the Finance list shows everyone's).
export async function withBalances(advances, { excludeReportId = null } = {}) {
  if (!advances?.length) return []
  const { data: uses } = await supabase
    .from('report_advances')
    .select('report_id, advance_id, amount, expense_reports(status)')
    .in('advance_id', advances.map(a => a.id))
  const used = {}
  for (const u of uses || []) {
    if (u.report_id === excludeReportId) continue
    if (!COUNTED.includes(u.expense_reports?.status)) continue
    used[u.advance_id] = (used[u.advance_id] || 0) + (Number(u.amount) || 0)
  }
  return advances.map(a => {
    const u = used[a.id] || 0
    return { ...a, amount: Number(a.amount) || 0, used: u, remaining: Math.max(0, (Number(a.amount) || 0) - u) }
  })
}

// Spreads `total` over the advances in the order given, each up to what it has
// left. Anything beyond what the advances can cover is not allocated: it is the
// part the company reimburses.
export function allocateToAdvances(total, advances) {
  let left = Math.max(0, Number(total) || 0)
  const out = []
  for (const a of advances) {
    if (left <= 0) break
    const take = Math.min(left, Math.max(0, Number(a.remaining) || 0))
    if (take > 0) { out.push({ advance_id: a.id, amount: Math.round(take * 100) / 100 }); left -= take }
  }
  return out
}

// Replaces a report's draw on advances and records the total on the report.
export async function saveReportAdvances(reportId, allocation) {
  await supabase.from('report_advances').delete().eq('report_id', reportId)
  if (allocation.length) {
    const { error } = await supabase.from('report_advances').insert(allocation.map(a => ({ report_id: reportId, advance_id: a.advance_id, amount: a.amount })))
    if (error) throw error
  }
  const applied = allocation.reduce((s, a) => s + a.amount, 0)
  await supabase.from('expense_reports').update({ advance_applied: allocation.length ? applied : null }).eq('id', reportId)
  // Anything on screen showing advance balances can refresh itself.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('nudge-advance-change'))
  return applied
}

// After Accounts changes a line, work out again how much of the report is
// settled from its advances. The advances used stay the same; only the amount
// follows the new net. Reports with no advance draw are left alone.
export async function recomputeAdvanceApplied(reportId, { reimbursableNet, settleLinesNet }) {
  const { data: report } = await supabase.from('expense_reports').select('employee_email, advance_id, advance_choice').eq('id', reportId).maybeSingle()
  const { data: rows } = await supabase.from('report_advances').select('advance_id').eq('report_id', reportId)
  if (!report || !rows?.length) return null
  const wholeReport = !!report.advance_id || report.advance_choice === 'deduct'
  const base = wholeReport ? reimbursableNet : settleLinesNet
  const balances = await loadAdvanceBalances([report.employee_email], { excludeReportId: reportId })
  const mine = balances.filter(b => rows.some(r => r.advance_id === b.id))
  return saveReportAdvances(reportId, allocateToAdvances(base, mine))
}

// What goes out in cash: the net, less whatever came from the advances.
export const payoutAmount = r => Math.max(0, (r?.net_payable != null ? Number(r.net_payable) : Number(r?.total_amount) || 0) - (Number(r?.advance_applied) || 0))
