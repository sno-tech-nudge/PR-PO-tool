// Vercel serverless function — the browser's only way to reach Gemini now.
// GEMINI_API_KEY (no VITE_ prefix, unlike the VITE_GEMINI_API_KEY this
// replaces) never gets bundled into client JS, so this is the only place
// that key exists. Called by src/lib/gemini.js's callGemini() whenever it's
// running in the browser — server-side callers (api/intake/extract.js) skip
// this entirely and call callGeminiDirect() in-process instead.
import { callGeminiDirect } from '../../src/lib/gemini.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { base64Image, prompt, mimeType } = req.body || {}
  if (!base64Image || !prompt) {
    res.status(400).json({ error: 'base64Image and prompt are required' })
    return
  }
  const result = await callGeminiDirect(base64Image, prompt, mimeType)
  res.status(200).json(result.ok ? { ok: true, value: result.value } : { ok: false })
}
