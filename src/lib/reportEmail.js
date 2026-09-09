// Fires Expense Report lifecycle emails via the /api/send-report-email
// Vercel function. Same "best-effort, never blocks the DB update it
// follows" pattern as createNotification in approvalEngine.js.
export async function sendReportEmail({ type, recipientEmail, reportReference, amount, actorName, reason, nextLevelLabel, currentStep }) {
  const hasRecipient = Array.isArray(recipientEmail) ? recipientEmail.length > 0 : !!recipientEmail
  if (!hasRecipient) return
  try {
    const res = await fetch('/api/send-report-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, recipientEmail, reportReference, amount, actorName, reason, nextLevelLabel, currentStep }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('Report email failed:', data?.error || res.status)
    }
  } catch (err) {
    console.error('Report email request failed:', err)
  }
}
