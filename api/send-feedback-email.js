// Vercel serverless function — mirrors send-vendor-email.js's pattern.
// Called by src/lib/feedbackEmail.js right after a FeedbackWidget submission
// is written to the `feedback` table, so the team lead sees it immediately
// instead of having to check the table.

const BRAND_COLOR = '#8C3225'
const FEEDBACK_RECIPIENT = 'gaurang.wadhawan@thenudge.org'

const CATEGORY_LABEL = { bug: 'Bug', feature: 'Feature idea', general: 'General feedback' }

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function buildEmail({ category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId }) {
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

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:32px 0;">
      <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:6px;overflow:hidden;border:1px solid #E3E8EF;">
          <tr><td style="background:${BRAND_COLOR};padding:18px 24px;">
            <div style="font-size:14px;font-weight:700;color:#FFFFFF;">The Nudge Institute — Expense Tracker</div>
          </td></tr>
          <tr><td style="padding:24px;">
            <div style="font-size:17px;font-weight:700;color:#1A1F36;margin-bottom:4px;">New feedback: ${escapeHtml(categoryLabel)}</div>
            <div style="font-size:15px;font-weight:600;color:#374151;margin-bottom:14px;">${escapeHtml(title)}</div>
            <div style="font-size:14px;color:#1A1F36;background:#F8F9FA;border:1px solid #E3E8EF;border-radius:4px;padding:12px 14px;white-space:pre-wrap;margin-bottom:16px;">${escapeHtml(description)}</div>
            <table cellpadding="0" cellspacing="0">${rowsHtml}</table>
          </td></tr>
          <tr><td style="padding:14px 24px;background:#F8F9FA;border-top:1px solid #E3E8EF;">
            <div style="font-size:11px;color:#9CA3AF;">This is an automated message from the Nudge Expense Tracker. Please do not reply to this email.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  const text = `New feedback: ${categoryLabel}\n\n${title}\n\n${description}\n\n` +
    rows.map(([label, value]) => `${label}: ${value}`).join('\n')

  return { subject, html, text }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('send-feedback-email: RESEND_API_KEY is not configured')
    res.status(500).json({ error: 'Email is not configured on the server.' })
    return
  }

  const { category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId } = req.body || {}
  if (!category || !title || !description) {
    res.status(400).json({ error: 'category, title and description are required' })
    return
  }

  const { subject, html, text } = buildEmail({ category, title, description, severity, moduleName, pageUrl, browserInfo, submitterName, submitterEmail, refId })
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>'

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: fromAddress, to: [FEEDBACK_RECIPIENT], subject, html, text }),
    })
    const data = await resendRes.json()
    if (!resendRes.ok) {
      console.error('Resend API error:', data)
      res.status(502).json({ error: data?.message || 'Failed to send email' })
      return
    }
    res.status(200).json({ ok: true, id: data?.id })
  } catch (err) {
    console.error('send-feedback-email failed:', err)
    res.status(500).json({ error: 'Failed to send email' })
  }
}
