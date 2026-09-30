// Fires advance lifecycle emails via the shared /api/send-email Vercel
// function (entity: "advance"). Same "best-effort, never blocks the DB
// update it follows" pattern as sendVendorEmail/sendPREmail.
export async function sendAdvanceEmail({ type, recipientEmail, amount, description, actorName, reason }) {
  const hasRecipient = Array.isArray(recipientEmail) ? recipientEmail.length > 0 : !!recipientEmail
  if (!hasRecipient) return
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'advance', type, recipientEmail, amount, description, actorName, reason }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('Advance email failed:', data?.error || res.status)
    }
  } catch (err) {
    console.error('Advance email request failed:', err)
  }
}
