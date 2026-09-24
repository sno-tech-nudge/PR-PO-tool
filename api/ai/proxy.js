// Vercel serverless function — the browser's only way to reach Groq or
// Gemini now. GROQ_API_KEY / GEMINI_API_KEY (no VITE_ prefix, unlike the
// VITE_-prefixed vars these replace) never get bundled into client JS.
// Combined into one endpoint (dispatched by `provider`) rather than two
// separate files — this account's Vercel plan caps Serverless Functions per
// deployment, and it was already at that cap before this security fix.
// Called by src/lib/gemini.js's callGemini() / src/lib/groq.js's callGroq()
// whenever either runs in the browser — server-side callers (e.g.
// api/intake/extract.js) skip this entirely and call callGeminiDirect() /
// callGroqDirect() in-process instead.
import { callGeminiDirect } from '../../src/lib/gemini.js'
import { callGroqDirect } from '../../src/lib/groq.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { provider } = req.body || {}

  if (provider === 'gemini') {
    const { base64Image, prompt, mimeType } = req.body || {}
    if (!base64Image || !prompt) {
      res.status(400).json({ error: 'base64Image and prompt are required' })
      return
    }
    const result = await callGeminiDirect(base64Image, prompt, mimeType)
    res.status(200).json(result.ok ? { ok: true, value: result.value } : { ok: false })
    return
  }

  if (provider === 'groq') {
    const { messages, model, max_tokens, temperature } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages is required' })
      return
    }
    const value = await callGroqDirect(messages, { model, max_tokens, temperature })
    res.status(200).json({ ok: value !== null, value })
    return
  }

  res.status(400).json({ error: 'provider must be "gemini" or "groq"' })
}
