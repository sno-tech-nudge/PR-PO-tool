// Shared email-sending helpers — used by api/send-pr-email.js,
// api/send-report-email.js, and api/send-vendor-email.js so all three
// lifecycle-status emails share one brand header, one status-visual
// renderer, and one Resend call instead of each hand-rolling its own.
//
// Files/folders prefixed with "_" inside api/ are never turned into their
// own Vercel route, so this file is safe as a private, shared module.

export const BRAND_COLOR = '#8C3225'

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function renderBrandHeader() {
  return `<tr><td style="background:${BRAND_COLOR};padding:18px 24px;">
    <div style="font-size:14px;font-weight:700;color:#FFFFFF;">The Nudge Institute — Expense Tracker</div>
  </td></tr>`
}

// One colored pill — for entities with no multi-step timeline concept
// in-tool (Vendor), so the email doesn't invent a visual that isn't real.
export function renderStatusBadge({ label, color, bg }) {
  return `<tr><td style="padding:20px 24px 4px;">
    <span style="display:inline-block;font-size:12px;font-weight:700;color:${color};background:${bg};border:1px solid ${color}33;border-radius:3px;padding:5px 12px;">
      ${escapeHtml(label)}
    </span>
  </td></tr>`
}

const STEP_COLOR = {
  done: '#16A34A',
  current: '#1A1A1A',
  rejected: '#DC2626',
  waiting: '#E8E8E8',
}

// steps: [{ label, state: 'done'|'current'|'rejected'|'waiting' }] — an
// email-safe <table> row of small colored circles connected by lines,
// using the exact same state colors already used on-screen in
// PRStatusTimeline.jsx / StatusTimeline.jsx.
export function renderTimelineStrip(steps) {
  if (!steps?.length) return ''
  const cells = steps.map((step, i) => {
    const color = STEP_COLOR[step.state] || STEP_COLOR.waiting
    const textColor = step.state === 'waiting' ? '#9CA3AF' : '#1A1F36'
    const dot = `<div style="width:12px;height:12px;border-radius:50%;background:${color};margin:0 auto 6px;"></div>`
    const line = i < steps.length - 1 ? `<div style="position:absolute;top:5px;left:50%;width:100%;height:2px;background:${color === STEP_COLOR.waiting ? STEP_COLOR.waiting : color};"></div>` : ''
    return `<td style="position:relative;text-align:center;padding:0 4px;width:${Math.floor(100 / steps.length)}%;">
      ${line}
      <div style="position:relative;">${dot}</div>
      <div style="font-size:9px;color:${textColor};font-weight:${step.state === 'current' ? 700 : 500};">${escapeHtml(step.label)}</div>
    </td>`
  }).join('')
  return `<tr><td style="padding:20px 24px 4px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
  </td></tr>`
}

// headerHtml/statusHtml: full <tr> blocks (renderBrandHeader/renderStatusBadge/
// renderTimelineStrip already return these). bodyHtml: the message content —
// wrapped in its own <tr><td> here so callers just pass inner HTML.
export function wrapEmailShell({ headerHtml, statusHtml, bodyHtml }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:32px 0;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:6px;overflow:hidden;border:1px solid #E3E8EF;">
          ${headerHtml}
          ${statusHtml}
          <tr><td style="padding:16px 24px 24px;">
            <table cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;color:#374151;line-height:1.6;">${bodyHtml}</td></tr></table>
          </td></tr>
          <tr><td style="padding:14px 24px;background:#F8F9FA;border-top:1px solid #E3E8EF;">
            <div style="font-size:11px;color:#9CA3AF;">This is an automated message from the Nudge Expense Tracker. Please do not reply to this email.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

// { apiKey, from, to, subject, html, text } → { ok, id } on success; throws
// an Error carrying the Resend error message on failure, so callers can
// decide their own response shape rather than this module assuming one.
export async function sendViaResend({ apiKey, from, to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html, text }),
  })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data?.message || 'Failed to send email')
    err.resendError = data
    throw err
  }
  return { ok: true, id: data?.id }
}
