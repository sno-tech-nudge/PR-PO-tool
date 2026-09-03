// Fires the "new feedback" email via the /api/send-feedback-email Vercel
// function. Same "best-effort, never blocks the submission it follows"
// pattern as sendVendorEmail in vendorEmail.js — email delivery failing
// should never surface as a failed feedback submission.
export async function sendFeedbackEmail({ category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId }) {
  try {
    const res = await fetch('/api/send-feedback-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('Feedback email failed:', data?.error || res.status)
    }
  } catch (err) {
    console.error('Feedback email request failed:', err)
  }
}
