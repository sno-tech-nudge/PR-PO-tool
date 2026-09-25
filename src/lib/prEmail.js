// Fires PR lifecycle emails via the shared /api/send-email Vercel function
// (entity: "pr"). Same "best-effort, never blocks the DB update it follows"
// pattern as notifyRole/notifySlack in prApprovalActions.js — email
// delivery failing should never surface as a failed
// approval/rejection/submission.
export async function sendPREmail({ type, recipientEmail, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps }) {
  const hasRecipient = Array.isArray(recipientEmail) ? recipientEmail.length > 0 : !!recipientEmail
  if (!hasRecipient) return
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'pr', type, recipientEmail, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('PR email failed:', data?.error || res.status)
    }
  } catch (err) {
    console.error('PR email request failed:', err)
  }
}
