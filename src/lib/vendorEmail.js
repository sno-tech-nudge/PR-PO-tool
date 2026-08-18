// Fires the vendor approved/rejected email via the /api/send-vendor-email
// Vercel function. Same "best-effort, never blocks the DB update it follows"
// pattern as the expense_notifications inserts in VendorApprovalView.jsx —
// email delivery failing should never surface as a failed approval/rejection.
export async function sendVendorEmail({ type, vendorOrgName, vendorId, recipientEmail, actorName, reason, comment, panNumber, submitterEmail }) {
  const hasRecipient = Array.isArray(recipientEmail) ? recipientEmail.length > 0 : !!recipientEmail
  if (!hasRecipient) return
  try {
    const res = await fetch('/api/send-vendor-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, vendorOrgName, vendorId, recipientEmail, actorName, reason, comment, panNumber, submitterEmail }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('Vendor email failed:', data?.error || res.status)
    }
  } catch (err) {
    console.error('Vendor email request failed:', err)
  }
}
