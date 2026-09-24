// Vercel serverless function — the browser's only way to reach Groq now.
// GROQ_API_KEY (no VITE_ prefix, unlike the VITE_GROQ_API_KEY this replaces)
// never gets bundled into client JS. Called by src/lib/groq.js's callGroq()
// whenever it's running in the browser.
import { callGroqDirect } from '../../src/lib/groq.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { messages, model, max_tokens, temperature } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required' })
    return
  }
  const value = await callGroqDirect(messages, { model, max_tokens, temperature })
  res.status(200).json({ ok: value !== null, value })
}
