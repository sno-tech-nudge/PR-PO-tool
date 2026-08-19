// Turnaround-time helpers for the Finance Dashboard's Approval History tab.
// Pure functions, no Supabase calls — callers pass in already-fetched rows.

export function daysBetween(startISO, endISO) {
  if (!startISO || !endISO) return null
  const ms = new Date(endISO) - new Date(startISO)
  if (Number.isNaN(ms)) return null
  return Math.round((ms / (1000 * 60 * 60 * 24)) * 10) / 10
}

export function avgTAT(rows, startField, endField) {
  const durations = rows
    .map(r => daysBetween(r[startField], r[endField]))
    .filter(d => d != null && d >= 0)
  if (!durations.length) return null
  return Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
}

// purchase_requests has no approved_at column — the moment a PR is fully
// approved is only recorded per-level, on its pr_approvals rows.
export function prApprovedAt(pr, approvals) {
  if (pr.status !== 'approved' && pr.status !== 'po_generated') return null
  const approvedRows = (approvals || []).filter(a => a.status === 'approved' && a.actioned_at)
  if (!approvedRows.length) return null
  return approvedRows.reduce((latest, a) => (!latest || a.actioned_at > latest ? a.actioned_at : latest), null)
}
