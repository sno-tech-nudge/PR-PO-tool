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

// True only under Node (this project's api/ serverless functions) — never in
// the browser bundle, where `process` isn't declared at all. This is what
// decides whether a call goes straight to Google (server, real API key
// available) or through /api/ai/gemini instead (browser — no key present at
// all anymore, by design: GEMINI_API_KEY has no VITE_ prefix, so Vite never
// inlines it into client JS, unlike the old VITE_GEMINI_API_KEY it replaces).
function isServerRuntime() {
  return typeof globalThis.process !== 'undefined' && !!globalThis.process.versions?.node
}

// One real Gemini API call — server-side only, real key required. Exported
// so api/ai/gemini.js (the browser-facing proxy) can call this directly:
// when that endpoint runs, it's always in Node, so this is exactly the
// function it needs, no re-entrant environment check required.
export async function callGeminiDirect(base64Image, prompt, mimeType) {
  const key = globalThis.process?.env?.GEMINI_API_KEY
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
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Image } },
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
      console.error('Gemini API error:', data.error.message)
      return { ok: false }
    }
    const candidate = data.candidates?.[0]
    const finishReason = candidate?.finishReason
    if (finishReason && finishReason !== 'STOP') {
      console.error(`Gemini finished with reason "${finishReason}" instead of STOP (truncated or blocked response).`, data.promptFeedback || '')
    }
    const text = candidate?.content?.parts?.[0]?.text
    if (!text) {
      console.error('Gemini — empty response.', JSON.stringify(data).slice(0, 300))
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
      console.error('Gemini — returned non-JSON despite responseMimeType, raw text:', text.slice(0, 300))
      return { ok: false }
    }
  } catch (error) {
    console.error('Gemini — call failed:', error.name === 'AbortError' ? 'Request timed out' : error.message)
    return { ok: false }
  } finally {
    clearTimeout(timeout)
  }
}

// One attempt via the server-side proxy — used from the browser, where no
// Gemini key is present at all anymore. The proxy itself makes exactly one
// Gemini call per request (no internal retry), since the retry loop below
// already retries by calling this endpoint again — retrying at both layers
// would multiply attempts unnecessarily.
async function callGeminiViaProxy(base64Image, prompt, mimeType) {
  try {
    const res = await fetch('/api/ai/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, prompt, mimeType }),
    })
    const data = await res.json()
    return data.ok ? { ok: true, value: data.value } : { ok: false }
  } catch {
    return { ok: false }
  }
}

// mimeType defaults to 'image/jpeg' — every existing browser caller already
// pre-converts to JPEG client-side and never passes this. api/intake/extract.js
// is the one caller that passes 'application/pdf' for a PDF document, since
// Gemini can read PDFs natively without needing to rasterize a page first.
export async function callGemini(base64Image, prompt, mimeType) {
  const attempt = isServerRuntime() ? callGeminiDirect : callGeminiViaProxy
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const result = await attempt(base64Image, prompt, mimeType)
    if (result.ok) return result.value
    if (i < MAX_ATTEMPTS) console.log(`Gemini attempt ${i} failed, retrying…`)
  }
  return null
}
