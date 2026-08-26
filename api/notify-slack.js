// Vercel serverless proxy for Slack notifications. Slack's Incoming Webhook
// endpoint doesn't send CORS headers, so a browser-side fetch() straight to
// hooks.slack.com fails with a silent "Failed to fetch" (caught by the
// client's non-blocking try/catch, which is exactly why the client-side
// calls were never actually reaching Slack) - server-to-server calls have
// no CORS restriction, so this just forwards the message through.
// Mirrors api/send-vendor-email.js: the real webhook URL lives only here,
// server-side, never in the client bundle.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) {
    // Matches the client's own "unconfigured = silent no-op" design —
    // nothing breaks, the message just doesn't get sent.
    res.status(200).json({ ok: true, skipped: true })
    return
  }
  const { text } = req.body || {}
  if (!text) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  try {
    const slackRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const body = await slackRes.text()
    if (!slackRes.ok) {
      console.error('Slack webhook error:', body)
      res.status(502).json({ error: body })
      return
    }
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('notify-slack failed:', err)
    res.status(500).json({ error: err.message })
  }
}
