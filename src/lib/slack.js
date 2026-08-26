// Slack notifications via a single Incoming Webhook — posts into one shared
// channel (whatever channel the webhook was created for in Slack), using
// Slack's mrkdwn link syntax (<url|label>) in the plain `text` field so the
// message body itself is a clickable hyperlink straight back into the app.
// Same posture as this app's existing client-side AI calls (Groq/Gemini):
// no backend layer here, so the webhook URL ships in the client bundle like
// those keys do — acceptable for an internal tool, but anyone with the built
// JS can extract it and post into the channel, so treat it accordingly.
const WEBHOOK_URL = import.meta.env.VITE_SLACK_WEBHOOK_URL

// Best-effort — a missing webhook, a Slack outage, or a network hiccup must
// never block the action (submit/approve/reject) that triggered the message.
export async function notifySlack(text) {
  if (!WEBHOOK_URL) return
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch { /* non-blocking */ }
}

// Deep link back into the app for a given record — read by App.jsx's
// `?type=pr|po&id=...` handling on load to jump straight to that record's
// detail view instead of just opening to the home screen.
export function recordUrl(type, id) {
  return `${window.location.origin}${window.location.pathname}?type=${type}&id=${id}`
}
