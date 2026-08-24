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
// never leave a caller's "extracting…" UI state stuck forever — abort after
// 20s so callers always get a null result back and can fall back to manual
// entry, per the "extraction can fail, submission must not be blocked" rule.
const REQUEST_TIMEOUT_MS = 20000

export async function callGemini(base64Image, prompt) {
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
        generationConfig: { temperature: 0 },
      }),
    })
    const data = await response.json()
    if (data.error) {
      console.log('Gemini API error:', data.error.message)
      return null
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    const cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/^json/g, '')
      .trim()
    return JSON.parse(cleaned)
  } catch (error) {
    console.log('Gemini call failed:', error.name === 'AbortError' ? 'Request timed out' : error.message)
    return null
  } finally {
    clearTimeout(timeout)
  }
}
