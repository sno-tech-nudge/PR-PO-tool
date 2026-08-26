// Vision extraction provider — Groq's account for this project has no
// vision-capable model available (confirmed by testing every model on two
// separate keys), so image-based extraction (receipts, UPI screenshots,
// vendor quotes) goes through Gemini instead. Text-only AI features stay on
// Groq (lib/claude.js) since that works fine there.
// Using the "-latest" alias rather than a dated version (e.g. gemini-2.5-flash)
// deliberately — Google retires dated model versions on a rolling basis (this
// project already hit that once), and the alias stays pointed at whatever
// their current fast model is.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'

// A stuck/hung request (dropped connection, no response ever arriving) must
// never leave a caller's "extracting…" UI state stuck forever — abort so
// callers always get a null result back and can fall back to manual entry,
// per the "extraction can fail, submission must not be blocked" rule. Kept
// per-attempt rather than for the whole call so a single slow/dropped
// request doesn't burn the one retry attempt has left to try again with.
const REQUEST_TIMEOUT_MS = 12000

// One retry, not more — most real-world failures here are transient (a
// model-overloaded response, a dropped connection, a rare malformed-JSON
// reply) and succeed immediately on a second try; a caller still waiting
// after two attempts is far more likely hitting something retrying won't
// fix (bad image, wrong key) than something that needs a third shot.
const MAX_ATTEMPTS = 2

async function callGeminiOnce(base64Image, prompt) {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
            { text: prompt },
          ],
        }],
        // responseMimeType forces the model to emit valid JSON at decode
        // time instead of merely being asked to via the prompt — this is
        // what actually eliminates the "wrapped it in a sentence" / "added
        // a markdown fence anyway" failures that used to break JSON.parse
        // below even when the extraction itself was accurate.
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    })
    const data = await response.json()
    if (data.error) {
      console.log('Gemini API error:', data.error.message)
      return { ok: false, retryable: true }
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return { ok: false, retryable: true }
    const cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/^json/g, '')
      .trim()
    try {
      return { ok: true, value: JSON.parse(cleaned) }
    } catch {
      console.log('Gemini returned non-JSON despite responseMimeType, raw text:', text.slice(0, 200))
      return { ok: false, retryable: true }
    }
  } catch (error) {
    console.log('Gemini call failed:', error.name === 'AbortError' ? 'Request timed out' : error.message)
    return { ok: false, retryable: true }
  } finally {
    clearTimeout(timeout)
  }
}

export async function callGemini(base64Image, prompt) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callGeminiOnce(base64Image, prompt)
    if (result.ok) return result.value
    if (attempt < MAX_ATTEMPTS) console.log(`Gemini attempt ${attempt} failed, retrying…`)
  }
  return null
}
