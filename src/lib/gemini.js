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

// Two retries (three attempts total) — most real-world failures here are
// transient (a model-overloaded response, a dropped connection, a rare
// malformed-JSON reply) and succeed on a second or third try; a caller
// still failing after three attempts is far more likely hitting something
// retrying won't fix (bad image, wrong key) than something that needs a
// fourth shot.
const MAX_ATTEMPTS = 3

async function callGeminiOnce(base64Image, prompt, attempt) {
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
        generationConfig: {
          temperature: 0,
          // responseMimeType forces the model to emit valid JSON at decode
          // time instead of merely being asked to via the prompt — this is
          // what eliminates the "wrapped it in a sentence" / "added a
          // markdown fence anyway" failures that used to break JSON.parse
          // below even when the extraction itself was accurate.
          responseMimeType: 'application/json',
          // gemini-flash-latest resolves to a 2.5-generation model, which
          // "thinks" (spends part of its output token budget on internal
          // reasoning) by default. On a denser real document that can eat
          // the whole budget before the model ever writes the JSON answer,
          // producing an empty/truncated response that looks identical to
          // a network failure — this was the actual cause of most
          // real-world extraction failures, not image quality. Turning
          // thinking off is both more reliable (no more budget lost to
          // reasoning the task doesn't need) and faster.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 4096,
        },
      }),
    })
    const data = await response.json()
    if (data.error) {
      console.error(`Gemini attempt ${attempt} — API error:`, data.error.message)
      return { ok: false }
    }
    const candidate = data.candidates?.[0]
    const finishReason = candidate?.finishReason
    if (finishReason && finishReason !== 'STOP') {
      console.error(`Gemini attempt ${attempt} — finished with reason "${finishReason}" instead of STOP (truncated or blocked response).`, data.promptFeedback || '')
    }
    const text = candidate?.content?.parts?.[0]?.text
    if (!text) {
      console.error(`Gemini attempt ${attempt} — empty response.`, JSON.stringify(data).slice(0, 300))
      return { ok: false }
    }
    const cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/^json/g, '')
      .trim()
    try {
      return { ok: true, value: JSON.parse(cleaned) }
    } catch {
      console.error(`Gemini attempt ${attempt} — returned non-JSON despite responseMimeType, raw text:`, text.slice(0, 300))
      return { ok: false }
    }
  } catch (error) {
    console.error(`Gemini attempt ${attempt} — call failed:`, error.name === 'AbortError' ? 'Request timed out' : error.message)
    return { ok: false }
  } finally {
    clearTimeout(timeout)
  }
}

export async function callGemini(base64Image, prompt) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callGeminiOnce(base64Image, prompt, attempt)
    if (result.ok) return result.value
    if (attempt < MAX_ATTEMPTS) console.log(`Gemini attempt ${attempt} failed, retrying…`)
  }
  return null
}
