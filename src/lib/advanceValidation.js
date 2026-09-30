// Guardrails for the Advances module — both are hard limits from the Travel
// & Expense policy: max ₹20,000 per advance, and it must be raised at least
// 7 days before the expected spend date. There's no backend job queue in
// this app (pure Vite + Supabase client), and none is needed for the 7-day
// rule — it only ever compares "today" to the chosen expected-usage-date,
// both known the instant the form is submitted.

export const MAX_ADVANCE_AMOUNT = 20000
export const MIN_DAYS_NOTICE = 7

// Whole-day difference, ignoring time-of-day, so "raised today for a date
// exactly 7 days out" counts as exactly 7 days' notice rather than being off
// by a fraction of a day depending on the current time.
export function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

export function isAutoRejected(expectedUsageDate) {
  const days = daysUntil(expectedUsageDate)
  return days == null || days < MIN_DAYS_NOTICE
}

export function autoRejectReason(expectedUsageDate) {
  const days = daysUntil(expectedUsageDate)
  const notice = days == null || days < 0 ? 0 : days
  return `Auto-rejected: advances must be raised at least ${MIN_DAYS_NOTICE} days before the expected usage date (only ${notice} day${notice === 1 ? '' : 's'} notice given).`
}
