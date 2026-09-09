// Vercel serverless function — Purchase Request lifecycle emails. Called by
// src/lib/prEmail.js at each stage: submitted, advanced to the next
// approver/stage, a role's action-needed notice, rejected, and PO issued.
import { escapeHtml, renderBrandHeader, renderTimelineStrip, wrapEmailShell, sendViaResend } from './_lib/mailer.js'

function fmtAmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}` }

const TYPES = ['submitted', 'advanced', 'action_needed', 'rejected', 'finalized']

function buildEmail({ type, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps }) {
  let subject, headline, headlineColor, bodyLine

  switch (type) {
    case 'submitted':
      subject = `Purchase Request Submitted: ${prNumber}`
      headline = 'Purchase Request Submitted'
      headlineColor = '#1A1A1A'
      bodyLine = `Your purchase request <strong>${escapeHtml(prNumber)}</strong> for ${fmtAmt(amount)} has been submitted and is now awaiting approval.`
      break
    case 'advanced':
      subject = `Purchase Request Update: ${prNumber}`
      headline = 'Approved — Moving to the Next Stage'
      headlineColor = '#16A34A'
      bodyLine = `Your purchase request <strong>${escapeHtml(prNumber)}</strong> was approved by ${escapeHtml(actorName || 'an approver')} and is now awaiting <strong>${escapeHtml(nextLevelLabel || 'the next approver')}</strong>.`
      break
    case 'action_needed':
      subject = `Action Needed — Purchase Request ${prNumber}`
      headline = 'Awaiting Your Review'
      headlineColor = '#8C3225'
      bodyLine = `Purchase Request <strong>${escapeHtml(prNumber)}</strong> for ${fmtAmt(amount)} is now awaiting your review as <strong>${escapeHtml(nextLevelLabel || 'the next approver')}</strong>.`
      break
    case 'rejected':
      subject = `Purchase Request Rejected: ${prNumber}`
      headline = 'Rejected'
      headlineColor = '#DC2626'
      bodyLine = `Your purchase request <strong>${escapeHtml(prNumber)}</strong> was rejected by ${escapeHtml(actorName || 'an approver')}.${reason ? ` Reason: ${escapeHtml(reason)}.` : ''} You can edit and resubmit it.`
      break
    case 'finalized':
      subject = `Purchase Order Issued: ${prNumber}`
      headline = 'Purchase Order Issued'
      headlineColor = '#16A34A'
      bodyLine = `${poNumber ? `Purchase Order <strong>${escapeHtml(poNumber)}</strong> for your` : 'A Purchase Order for your'} request <strong>${escapeHtml(prNumber)}</strong> has been approved and issued.`
      break
  }

  const statusHtml = timelineSteps?.length
    ? renderTimelineStrip(timelineSteps)
    : ''
  const html = wrapEmailShell({
    headerHtml: renderBrandHeader(),
    statusHtml,
    bodyHtml: `<div style="font-size:16px;font-weight:700;color:${headlineColor};margin-bottom:10px;">${headline}</div>${bodyLine}`,
  })
  const text = `${headline}\n\n${bodyLine.replace(/<[^>]+>/g, '')}`
  return { subject, html, text }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('send-pr-email: RESEND_API_KEY is not configured')
    res.status(500).json({ error: 'Email is not configured on the server.' })
    return
  }

  const { type, recipientEmail, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps } = req.body || {}
  if (!TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` })
    return
  }
  const recipients = Array.isArray(recipientEmail) ? recipientEmail.filter(Boolean) : [recipientEmail].filter(Boolean)
  if (recipients.length === 0 || !prNumber) {
    res.status(400).json({ error: 'recipientEmail and prNumber are required' })
    return
  }

  const { subject, html, text } = buildEmail({ type, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'

  try {
    const result = await sendViaResend({ apiKey, from: fromAddress, to: recipients, subject, html, text })
    res.status(200).json(result)
  } catch (err) {
    console.error('send-pr-email failed:', err.resendError || err)
    res.status(502).json({ error: err.message || 'Failed to send email' })
  }
}
