// Vercel serverless function — Expense Report lifecycle emails. Called by
// src/lib/reportEmail.js at each stage: submitted, advanced to the next
// approver/stage, a role's action-needed notice, rejected, and reimbursed.
import { escapeHtml, renderBrandHeader, renderTimelineStrip, wrapEmailShell, sendViaResend } from './_lib/mailer.js'

function fmtAmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}` }

const TYPES = ['submitted', 'advanced', 'action_needed', 'rejected', 'finalized']

// Same fixed sequence StatusTimeline.jsx renders on-screen for a report —
// currentStep: 0=Submitted, 1=Under Review, 2=Approved, 3=Processing,
// 4=Reimbursed, -1=Rejected (rendered as its own line, not a strip position).
const STEPS = ['Submitted', 'Under Review', 'Approved', 'Processing', 'Reimbursed']

function buildTimelineSteps(currentStep) {
  if (currentStep == null || currentStep < 0) return null
  return STEPS.map((label, i) => ({
    label,
    state: i < currentStep ? 'done' : i === currentStep ? 'current' : 'waiting',
  }))
}

function buildEmail({ type, reportReference, amount, actorName, reason, nextLevelLabel, currentStep }) {
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

  const timelineSteps = type === 'rejected' ? null : buildTimelineSteps(currentStep)
  const statusHtml = timelineSteps?.length ? renderTimelineStrip(timelineSteps) : ''
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
    console.error('send-report-email: RESEND_API_KEY is not configured')
    res.status(500).json({ error: 'Email is not configured on the server.' })
    return
  }

  const { type, recipientEmail, reportReference, amount, actorName, reason, nextLevelLabel, currentStep } = req.body || {}
  if (!TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` })
    return
  }
  const recipients = Array.isArray(recipientEmail) ? recipientEmail.filter(Boolean) : [recipientEmail].filter(Boolean)
  if (recipients.length === 0 || !reportReference) {
    res.status(400).json({ error: 'recipientEmail and reportReference are required' })
    return
  }

  const { subject, html, text } = buildEmail({ type, reportReference, amount, actorName, reason, nextLevelLabel, currentStep })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'

  try {
    const result = await sendViaResend({ apiKey, from: fromAddress, to: recipients, subject, html, text })
    res.status(200).json(result)
  } catch (err) {
    console.error('send-report-email failed:', err.resendError || err)
    res.status(502).json({ error: err.message || 'Failed to send email' })
  }
}
