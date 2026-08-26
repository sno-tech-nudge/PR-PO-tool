// Slack notifications, routed through api/notify-slack.js — Slack's
// Incoming Webhook endpoint doesn't send CORS headers, so a browser-side
// fetch() directly to hooks.slack.com fails silently (caught by this
// function's own non-blocking try/catch, which is exactly why calling it
// directly never actually reached Slack). The serverless proxy makes the
// server-to-server call instead, where CORS doesn't apply, and is also
// where the real webhook URL now lives — it no longer needs to ship in the
// client bundle at all.
export async function notifySlack(text) {
  try {
    await fetch('/api/notify-slack', {
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
