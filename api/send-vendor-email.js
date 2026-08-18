// Vercel serverless function — the only place RESEND_API_KEY is used, so it
// never reaches the browser bundle (unlike VITE_-prefixed env vars).
// Called by src/lib/vendorEmail.js after a vendor is approved or rejected.

const BRAND_COLOR = '#8C3225'

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function buildEmail({ type, vendorOrgName, vendorId, actorName, reason, comment, panNumber, submitterEmail }) {
  const isApproved = type === 'approved'
  const isBlockedKyc = type === 'aadhaar_pan_not_linked'
  const vendorLabel = vendorId ? `${vendorOrgName} (${vendorId})` : vendorOrgName

  let subject, headline, headlineColor, bodyLine, noteLabel, noteValue
  if (isBlockedKyc) {
    subject = `Vendor Registration Blocked — Aadhaar/PAN Not Linked: ${vendorOrgName}`
    headline = 'Vendor Registration Blocked — Aadhaar/PAN Not Linked'
    headlineColor = '#B45309'
    bodyLine = `${escapeHtml(submitterEmail || 'A user')} tried to register vendor <strong>${escapeHtml(vendorOrgName)}</strong>` +
      `${panNumber ? ` (PAN ${escapeHtml(panNumber)})` : ''} and disclosed that their Aadhaar and PAN are <strong>not linked</strong>. ` +
      `The submission was blocked and no vendor record was created. Flagging for Finance's awareness in case follow-up is needed.`
  } else {
    subject = `Vendor ${isApproved ? 'Approved' : 'Not Approved'}: ${vendorLabel}`
    headline = isApproved ? 'Vendor Approved' : 'Vendor Not Approved'
    headlineColor = isApproved ? '#15803D' : '#B91C1C'
    bodyLine = isApproved
      ? `Your vendor <strong>${escapeHtml(vendorLabel)}</strong> has been approved by ${escapeHtml(actorName || 'Finance')}. You can now raise purchase requests against them.`
      : `Your vendor <strong>${escapeHtml(vendorLabel)}</strong> was not approved by ${escapeHtml(actorName || 'Finance')}. You can edit and resubmit it.`
    noteLabel = isApproved ? 'Comment' : 'Reason'
    noteValue = isApproved ? comment : reason
  }

  const noteBlock = noteValue
    ? `<tr><td style="padding-top:16px;">
         <div style="font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${noteLabel}</div>
         <div style="font-size:14px;color:#1A1F36;background:#F8F9FA;border:1px solid #E3E8EF;border-radius:4px;padding:12px 14px;">${escapeHtml(noteValue)}</div>
       </td></tr>`
    : ''

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:32px 0;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:6px;overflow:hidden;border:1px solid #E3E8EF;">
          <tr><td style="background:${BRAND_COLOR};padding:18px 24px;">
            <div style="font-size:14px;font-weight:700;color:#FFFFFF;">The Nudge Institute — Expense Tracker</div>
          </td></tr>
          <tr><td style="padding:24px;">
            <div style="font-size:17px;font-weight:700;color:${headlineColor};margin-bottom:12px;">${headline}</div>
            <table cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;color:#374151;line-height:1.6;">${bodyLine}</td></tr>${noteBlock}</table>
          </td></tr>
          <tr><td style="padding:14px 24px;background:#F8F9FA;border-top:1px solid #E3E8EF;">
            <div style="font-size:11px;color:#9CA3AF;">This is an automated message from the Nudge Expense Tracker. Please do not reply to this email.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  const text = `${headline}\n\n${bodyLine.replace(/<[^>]+>/g, '')}${noteValue ? `\n\n${noteLabel}: ${noteValue}` : ''}`

  return { subject, html, text }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('send-vendor-email: RESEND_API_KEY is not configured')
    res.status(500).json({ error: 'Email is not configured on the server.' })
    return
  }

  const { type, vendorOrgName, vendorId, recipientEmail, actorName, reason, comment, panNumber, submitterEmail } = req.body || {}
  if (!['approved', 'rejected', 'aadhaar_pan_not_linked'].includes(type)) {
    res.status(400).json({ error: 'type must be "approved", "rejected" or "aadhaar_pan_not_linked"' })
    return
  }
  const recipients = Array.isArray(recipientEmail) ? recipientEmail.filter(Boolean) : [recipientEmail].filter(Boolean)
  if (recipients.length === 0 || !vendorOrgName || (type !== 'aadhaar_pan_not_linked' && !vendorId)) {
    res.status(400).json({ error: 'recipientEmail and vendorOrgName are required (vendorId too, unless type is aadhaar_pan_not_linked)' })
    return
  }

  const { subject, html, text } = buildEmail({ type, vendorOrgName, vendorId, actorName, reason, comment, panNumber, submitterEmail })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: fromAddress, to: recipients, subject, html, text }),
    })
    const data = await resendRes.json()
    if (!resendRes.ok) {
      console.error('Resend API error:', data)
      res.status(502).json({ error: data?.message || 'Failed to send email' })
      return
    }
    res.status(200).json({ ok: true, id: data?.id })
  } catch (err) {
    console.error('send-vendor-email failed:', err)
    res.status(500).json({ error: 'Failed to send email' })
  }
}
