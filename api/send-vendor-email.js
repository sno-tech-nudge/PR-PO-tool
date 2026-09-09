// Vercel serverless function — the only place RESEND_API_KEY is used, so it
// never reaches the browser bundle (unlike VITE_-prefixed env vars).
// Called by src/lib/vendorEmail.js after a vendor is submitted, approved,
// or rejected. Template built from the shared api/_lib/mailer.js helpers so
// PR/Report/Vendor lifecycle emails all look consistent.
import { escapeHtml, renderBrandHeader, renderStatusBadge, wrapEmailShell, sendViaResend } from './_lib/mailer.js'

const STATUS_BADGE = {
  submitted: { label: 'Pending Approval', color: '#B45309', bg: '#FFFBEB' },
  approved:  { label: 'Approved',         color: '#15803D', bg: '#F0FDF4' },
  rejected:  { label: 'Rejected',         color: '#B91C1C', bg: '#FEF2F2' },
}

function buildEmail({ type, vendorOrgName, vendorId, actorName, reason, comment, panNumber, submitterEmail }) {
  const isApproved = type === 'approved'
  const isBlockedKyc = type === 'aadhaar_pan_not_linked'
  const vendorLabel = vendorId ? `${vendorOrgName} (${vendorId})` : vendorOrgName

  let subject, headline, headlineColor, bodyLine, noteLabel, noteValue, badge
  if (isBlockedKyc) {
    subject = `Vendor Registration Blocked — Aadhaar/PAN Not Linked: ${vendorOrgName}`
    headline = 'Vendor Registration Blocked — Aadhaar/PAN Not Linked'
    headlineColor = '#B45309'
    bodyLine = `${escapeHtml(submitterEmail || 'A user')} tried to register vendor <strong>${escapeHtml(vendorOrgName)}</strong>` +
      `${panNumber ? ` (PAN ${escapeHtml(panNumber)})` : ''} and disclosed that their Aadhaar and PAN are <strong>not linked</strong>. ` +
      `The submission was blocked and no vendor record was created. Flagging for Finance's awareness in case follow-up is needed.`
  } else if (type === 'submitted') {
    subject = `Vendor Submitted: ${vendorLabel}`
    headline = 'Vendor Submitted'
    headlineColor = '#1A1A1A'
    badge = STATUS_BADGE.submitted
    bodyLine = `Your vendor <strong>${escapeHtml(vendorLabel)}</strong> has been submitted and is now awaiting approval.`
  } else {
    subject = `Vendor ${isApproved ? 'Approved' : 'Not Approved'}: ${vendorLabel}`
    headline = isApproved ? 'Vendor Approved' : 'Vendor Not Approved'
    headlineColor = isApproved ? '#15803D' : '#B91C1C'
    badge = isApproved ? STATUS_BADGE.approved : STATUS_BADGE.rejected
    bodyLine = isApproved
      ? `Your vendor <strong>${escapeHtml(vendorLabel)}</strong> has been approved by ${escapeHtml(actorName || 'Finance')}. You can now raise purchase requests against them.`
      : `Your vendor <strong>${escapeHtml(vendorLabel)}</strong> was not approved by ${escapeHtml(actorName || 'Finance')}. You can edit and resubmit it.`
    noteLabel = isApproved ? 'Comment' : 'Reason'
    noteValue = isApproved ? comment : reason
  }

  const noteBlock = noteValue
    ? `<div style="margin-top:16px;">
         <div style="font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${noteLabel}</div>
         <div style="font-size:14px;color:#1A1F36;background:#F8F9FA;border:1px solid #E3E8EF;border-radius:4px;padding:12px 14px;">${escapeHtml(noteValue)}</div>
       </div>`
    : ''

  const html = wrapEmailShell({
    headerHtml: renderBrandHeader(),
    statusHtml: badge ? renderStatusBadge(badge) : '',
    bodyHtml: `<div style="font-size:16px;font-weight:700;color:${headlineColor};margin-bottom:10px;">${headline}</div>${bodyLine}${noteBlock}`,
  })
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
  if (!['submitted', 'approved', 'rejected', 'aadhaar_pan_not_linked'].includes(type)) {
    res.status(400).json({ error: 'type must be "submitted", "approved", "rejected" or "aadhaar_pan_not_linked"' })
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
    const result = await sendViaResend({ apiKey, from: fromAddress, to: recipients, subject, html, text })
    res.status(200).json(result)
  } catch (err) {
    console.error('send-vendor-email failed:', err.resendError || err)
    res.status(502).json({ error: err.message || 'Failed to send email' })
  }
}
