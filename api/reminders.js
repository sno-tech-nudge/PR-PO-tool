// Vercel Cron target (see vercel.json) — runs once daily and reminds
// people about anything that's been sitting for 24h+ with no action:
//   1. Draft PRs — nudge the requester to finish and submit.
//   2. Submitted PRs pending someone's approval — nudge whoever holds
//      that level's role (FL / PR Approver / Finance).
//   3. Rejected PRs — nudge the requester to edit and resubmit.
// `last_reminder_at` prevents re-notifying on every single cron run once a
// record is already overdue — a record is due again once its last
// reminder is itself ~20h old, so a once-a-day cron still lands close to
// a real 24h cadence per record without needing an hourly trigger.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const DAY_MS = 24 * 60 * 60 * 1000
const RENOTIFY_AFTER_MS = 20 * 60 * 60 * 1000

function isDue(referenceDate, lastReminderAt) {
  if (!referenceDate) return false
  const now = Date.now()
  if (now - new Date(referenceDate).getTime() < DAY_MS) return false
  if (!lastReminderAt) return true
  return now - new Date(lastReminderAt).getTime() >= RENOTIFY_AFTER_MS
}

async function notifySlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  } catch { /* non-blocking */ }
}

function recordUrl(origin, type, id) {
  return `${origin}/?type=${type}&id=${id}`
}

function fmtAmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}` }

async function remindDrafts(origin) {
  const { data } = await supabase
    .from('purchase_requests')
    .select('id, pr_number, requested_by, category, created_at, last_reminder_at')
    .eq('status', 'draft')
  let count = 0
  for (const pr of data || []) {
    if (!isDue(pr.created_at, pr.last_reminder_at)) continue
    await supabase.from('expense_notifications').insert({
      recipient_id: pr.requested_by,
      type: 'pr_draft_reminder',
      message: `Reminder: your draft purchase request${pr.pr_number ? ` ${pr.pr_number}` : ''} is still unfinished. Complete and submit it when ready.`,
      related_type: 'pr', related_id: pr.id,
    })
    await notifySlack(`⏰ Reminder: draft PR (${pr.category || 'uncategorized'}) by ${pr.requested_by} is still unfinished — <${recordUrl(origin, 'pr', pr.id)}|open it>.`)
    await supabase.from('purchase_requests').update({ last_reminder_at: new Date().toISOString() }).eq('id', pr.id)
    count++
  }
  return count
}

async function emailsByRole(roles) {
  const { data } = await supabase.from('team_members').select('email').in('role', roles)
  return (data || []).map(m => m.email)
}

async function levelRecipients(level) {
  const pinned = level.required_approver_email
  const base = pinned ? [pinned] : await emailsByRole([level.required_role])
  const superFl = level.required_role === 'fl' ? await emailsByRole(['super_fl']) : []
  const today = new Date().toISOString().slice(0, 10)
  const { data: dels } = await supabase
    .from('approval_delegations')
    .select('delegate_email, delegator_email, delegator_role')
    .is('revoked_at', null).lte('start_date', today).gte('end_date', today)
  const delegates = (dels || [])
    .filter(d => pinned ? d.delegator_email.toLowerCase() === pinned.toLowerCase() : d.delegator_role === level.required_role)
    .map(d => d.delegate_email)
  const seen = new Set()
  return [...base, ...superFl, ...delegates].filter(e => {
    const k = String(e || '').toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function remindPending(origin) {
  const { data } = await supabase
    .from('purchase_requests')
    .select('id, pr_number, amount, submitted_at, last_reminder_at, pr_approvals(required_role, required_approver_email, status)')
    .eq('status', 'submitted')
  let count = 0
  for (const pr of data || []) {
    if (!isDue(pr.submitted_at, pr.last_reminder_at)) continue
    const pendingLevel = (pr.pr_approvals || []).find(a => a.status === 'pending')
    if (!pendingLevel?.required_role) continue
    // Same audience as the original notification: the one pinned approver if
    // the level has one (otherwise everyone holding the role), Super FL for
    // the Functional Leader level, and anyone covering via a delegation.
    const recipients = await levelRecipients(pendingLevel)
    for (const email of recipients) {
      await supabase.from('expense_notifications').insert({
        recipient_id: email,
        type: 'pr_pending_reminder',
        message: `Reminder: PR ${pr.pr_number} for ${fmtAmt(pr.amount)} is still awaiting your review.`,
        related_type: 'pr', related_id: pr.id,
      })
    }
    await notifySlack(`⏰ Reminder: PR <${recordUrl(origin, 'pr', pr.id)}|${pr.pr_number}> still awaiting *${pendingLevel.required_role}* approval.`)
    await supabase.from('purchase_requests').update({ last_reminder_at: new Date().toISOString() }).eq('id', pr.id)
    count++
  }
  return count
}

async function remindRejected(origin) {
  const { data } = await supabase
    .from('purchase_requests')
    .select('id, pr_number, requested_by, rejection_reason, rejected_at, last_reminder_at')
    .eq('status', 'rejected')
  let count = 0
  for (const pr of data || []) {
    if (!isDue(pr.rejected_at, pr.last_reminder_at)) continue
    await supabase.from('expense_notifications').insert({
      recipient_id: pr.requested_by,
      type: 'pr_rejected_reminder',
      message: `Reminder: your purchase request ${pr.pr_number} was rejected (${pr.rejection_reason || 'no reason given'}). Edit and resubmit when ready.`,
      related_type: 'pr', related_id: pr.id,
    })
    await notifySlack(`⏰ Reminder: rejected PR <${recordUrl(origin, 'pr', pr.id)}|${pr.pr_number}> by ${pr.requested_by} still needs resubmission.`)
    await supabase.from('purchase_requests').update({ last_reminder_at: new Date().toISOString() }).eq('id', pr.id)
    count++
  }
  return count
}

export default async function handler(req, res) {
  // Vercel Cron requests carry this header automatically; a manually-set
  // CRON_SECRET additionally guards against anyone else hitting the route.
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Supabase is not configured on the server.' })
    return
  }

  const origin = `https://${req.headers.host}`
  try {
    const [drafts, pending, rejected] = await Promise.all([
      remindDrafts(origin),
      remindPending(origin),
      remindRejected(origin),
    ])
    res.status(200).json({ ok: true, reminded: { drafts, pending, rejected } })
  } catch (err) {
    console.error('reminders cron failed:', err)
    res.status(500).json({ error: 'Reminder run failed' })
  }
}
