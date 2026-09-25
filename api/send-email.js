// Vercel serverless function — every outbound lifecycle/notification email
// (feedback, PR, expense report, vendor) in one route, dispatched by
// `entity`. Previously four separate api/send-*-email.js files; merged into
// one because this account's Vercel plan caps Serverless Functions per
// deployment and this project was already at that cap before the
// Groq/Gemini security fix added its own new function. Each entity's
// request/response contract (fields, validation, status codes) is
// unchanged — only the URL and the added `entity` field differ from before.
import { escapeHtml, renderBrandHeader, renderStatusBadge, renderTimelineStrip, wrapEmailShell, sendViaResend } from './_lib/mailer.js'

const FEEDBACK_RECIPIENT = 'gaurang.wadhawan@thenudge.org'
const CATEGORY_LABEL = { bug: 'Bug', feature: 'Feature idea', general: 'General feedback' }

function fmtAmt(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

// --- feedback -----------------------------------------------------------

function buildFeedbackEmail({ category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId }) {
  const categoryLabel = CATEGORY_LABEL[category] || category
  const subject = `[Feedback${severity ? ` · ${severity}` : ''}] ${title}`

  const rows = [
    ['Category', categoryLabel],
    ['Severity', severity],
    ['Module', moduleName],
    ['Page', pageUrl],
    ['Browser / OS', browserInfo],
    ['Submitted by', submitterName ? `${submitterName} (${submitterEmail || 'no email'})` : submitterEmail],
    ['Reference', refId],
  ].filter(([, v]) => v)

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:4px 12px 4px 0;font-size:12px;color:#6B7280;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;font-size:13px;color:#1A1F36;">${escapeHtml(value)}</td>
    </tr>`).join('')

  const html = wrapEmailShell({
    headerHtml: renderBrandHeader(),
    statusHtml: '',
    bodyHtml: `
      <div style="font-size:17px;font-weight:700;color:#1A1F36;margin-bottom:4px;">New feedback: ${escapeHtml(categoryLabel)}</div>
      <div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:14px;">${escapeHtml(title)}</div>
      <div style="font-size:14px;color:#1A1F36;background:#F8F9FA;border:1px solid #E3E8EF;border-radius:4px;padding:12px 14px;white-space:pre-wrap;margin-bottom:16px;">${escapeHtml(description)}</div>
      <table cellpadding="0" cellspacing="0">${rowsHtml}</table>`,
  })

  const text = `New feedback: ${categoryLabel}\n\n${title}\n\n${description}\n\n` +
    rows.map(([label, value]) => `${label}: ${value}`).join('\n')

  return { subject, html, text }
}

async function handleFeedback(req, res, apiKey) {
  const { category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId } = req.body || {}
  if (!category || !title || !description) {
    res.status(400).json({ error: 'category, title and description are required' })
    return
  }
  const { subject, html, text } = buildFeedbackEmail({ category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'
  const result = await sendViaResend({ apiKey, from: fromAddress, to: [FEEDBACK_RECIPIENT], subject, html, text })
  res.status(200).json(result)
}

// --- vendor ---------------------------------------------------------------

const VENDOR_STATUS_BADGE = {
  submitted: { label: 'Pending Approval', color: '#B45309', bg: '#FFFBEB' },
  approved:  { label: 'Approved',         color: '#15803D', bg: '#F0FDF4' },
  rejected:  { label: 'Rejected',         color: '#B91C1C', bg: '#FEF2F2' },
}

// Exported so api/intake/vendor.js can send the identical "submitted"
// confirmation for a vendor that came in via Nucleus, instead of duplicating
// this copy.
export function buildVendorEmail({ type, vendorOrgName, vendorId, actorName, reason, comment, panNumber, submitterEmail }) {
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
    badge = VENDOR_STATUS_BADGE.submitted
    bodyLine = `Your vendor <strong>${escapeHtml(vendorLabel)}</strong> has been submitted and is now awaiting approval.`
  } else {
    subject = `Vendor ${isApproved ? 'Approved' : 'Not Approved'}: ${vendorLabel}`
    headline = isApproved ? 'Vendor Approved' : 'Vendor Not Approved'
    headlineColor = isApproved ? '#15803D' : '#B91C1C'
    badge = isApproved ? VENDOR_STATUS_BADGE.approved : VENDOR_STATUS_BADGE.rejected
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

async function handleVendor(req, res, apiKey) {
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
  const { subject, html, text } = buildVendorEmail({ type, vendorOrgName, vendorId, actorName, reason, comment, panNumber, submitterEmail })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'
  const result = await sendViaResend({ apiKey, from: fromAddress, to: recipients, subject, html, text })
  res.status(200).json(result)
}

// --- pr ---------------------------------------------------------------

const PR_TYPES = ['submitted', 'advanced', 'action_needed', 'rejected', 'finalized']

// Exported so api/intake/pr.js can send the identical "submitted"
// confirmation for a PR that came in via Nucleus, instead of duplicating
// this copy.
export function buildPrEmail({ type, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps }) {
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

  const statusHtml = timelineSteps?.length ? renderTimelineStrip(timelineSteps) : ''
  const html = wrapEmailShell({
    headerHtml: renderBrandHeader(),
    statusHtml,
    bodyHtml: `<div style="font-size:16px;font-weight:700;color:${headlineColor};margin-bottom:10px;">${headline}</div>${bodyLine}`,
  })
  const text = `${headline}\n\n${bodyLine.replace(/<[^>]+>/g, '')}`
  return { subject, html, text }
}

async function handlePr(req, res, apiKey) {
  const { type, recipientEmail, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps } = req.body || {}
  if (!PR_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${PR_TYPES.join(', ')}` })
    return
  }
  const recipients = Array.isArray(recipientEmail) ? recipientEmail.filter(Boolean) : [recipientEmail].filter(Boolean)
  if (recipients.length === 0 || !prNumber) {
    res.status(400).json({ error: 'recipientEmail and prNumber are required' })
    return
  }
  const { subject, html, text } = buildPrEmail({ type, prNumber, amount, actorName, reason, nextLevelLabel, poNumber, timelineSteps })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'
  const result = await sendViaResend({ apiKey, from: fromAddress, to: recipients, subject, html, text })
  res.status(200).json(result)
}

// --- report ---------------------------------------------------------------

const REPORT_TYPES = ['submitted', 'advanced', 'action_needed', 'rejected', 'finalized']

// Same fixed sequence StatusTimeline.jsx renders on-screen for a report —
// currentStep: 0=Submitted, 1=Under Review, 2=Approved, 3=Processing,
// 4=Reimbursed, -1=Rejected (rendered as its own line, not a strip position).
const REPORT_STEPS = ['Submitted', 'Under Review', 'Approved', 'Processing', 'Reimbursed']

function buildReportTimelineSteps(currentStep) {
  if (currentStep == null || currentStep < 0) return null
  return REPORT_STEPS.map((label, i) => ({
    label,
    state: i < currentStep ? 'done' : i === currentStep ? 'current' : 'waiting',
  }))
}

function buildReportEmail({ type, reportReference, amount, actorName, reason, nextLevelLabel, currentStep }) {
  let subject, headline, headlineColor, bodyLine

  switch (type) {
    case 'submitted':
      subject = `Expense Report Submitted: ${reportReference}`
      headline = 'Expense Report Submitted'
      headlineColor = '#1A1A1A'
      bodyLine = `Your expense report <strong>${escapeHtml(reportReference)}</strong> for ${fmtAmt(amount)} has been submitted and is now awaiting approval.`
      break
    case 'advanced':
      subject = `Expense Report Update: ${reportReference}`
      headline = 'Approved — Moving to the Next Stage'
      headlineColor = '#16A34A'
      bodyLine = `Your expense report <strong>${escapeHtml(reportReference)}</strong> was approved by ${escapeHtml(actorName || 'an approver')} and is now with <strong>${escapeHtml(nextLevelLabel || 'the next stage')}</strong>.`
      break
    case 'action_needed':
      subject = `Action Needed — Expense Report ${reportReference}`
      headline = 'Awaiting Your Review'
      headlineColor = '#8C3225'
      bodyLine = `Expense Report <strong>${escapeHtml(reportReference)}</strong> for ${fmtAmt(amount)} is now awaiting your review as <strong>${escapeHtml(nextLevelLabel || 'the next approver')}</strong>.`
      break
    case 'rejected':
      subject = `Expense Report Rejected: ${reportReference}`
      headline = 'Returned for Revision'
      headlineColor = '#DC2626'
      bodyLine = `Your expense report <strong>${escapeHtml(reportReference)}</strong> was returned by ${escapeHtml(actorName || 'an approver')}.${reason ? ` Reason: ${escapeHtml(reason)}.` : ''} You can edit and resubmit it.`
      break
    case 'finalized':
      subject = `Expense Report Reimbursed: ${reportReference}`
      headline = 'Reimbursed'
      headlineColor = '#16A34A'
      bodyLine = `Your expense report <strong>${escapeHtml(reportReference)}</strong> for ${fmtAmt(amount)} has been reimbursed. This report is now fully settled.`
      break
  }

  const timelineSteps = type === 'rejected' ? null : buildReportTimelineSteps(currentStep)
  const statusHtml = timelineSteps?.length ? renderTimelineStrip(timelineSteps) : ''
  const html = wrapEmailShell({
    headerHtml: renderBrandHeader(),
    statusHtml,
    bodyHtml: `<div style="font-size:16px;font-weight:700;color:${headlineColor};margin-bottom:10px;">${headline}</div>${bodyLine}`,
  })
  const text = `${headline}\n\n${bodyLine.replace(/<[^>]+>/g, '')}`
  return { subject, html, text }
}

async function handleReport(req, res, apiKey) {
  const { type, recipientEmail, reportReference, amount, actorName, reason, nextLevelLabel, currentStep } = req.body || {}
  if (!REPORT_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${REPORT_TYPES.join(', ')}` })
    return
  }
  const recipients = Array.isArray(recipientEmail) ? recipientEmail.filter(Boolean) : [recipientEmail].filter(Boolean)
  if (recipients.length === 0 || !reportReference) {
    res.status(400).json({ error: 'recipientEmail and reportReference are required' })
    return
  }
  const { subject, html, text } = buildReportEmail({ type, reportReference, amount, actorName, reason, nextLevelLabel, currentStep })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'
  const result = await sendViaResend({ apiKey, from: fromAddress, to: recipients, subject, html, text })
  res.status(200).json(result)
}

// --- dispatch ---------------------------------------------------------------

const HANDLERS = { feedback: handleFeedback, vendor: handleVendor, pr: handlePr, report: handleReport }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('send-email: RESEND_API_KEY is not configured')
    res.status(500).json({ error: 'Email is not configured on the server.' })
    return
  }

  const { entity } = req.body || {}
  const run = HANDLERS[entity]
  if (!run) {
    res.status(400).json({ error: 'entity must be one of feedback, vendor, pr, report' })
    return
  }

  try {
    await run(req, res, apiKey)
  } catch (err) {
    console.error(`send-email (${entity}) failed:`, err.resendError || err)
    res.status(502).json({ error: err.message || 'Failed to send email' })
  }
}
