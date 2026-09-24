// Text-only AI provider (report summaries, AI vouch checks, category
// suggestions) — see gemini.js for why image extraction stays on Gemini
// instead. Same environment-aware split as gemini.js: server-side calls Groq
// directly with a real key; the browser has no key at all and goes through
// /api/ai/proxy instead (a single endpoint shared with Gemini's own proxy,
// dispatched by `provider` — this account's Vercel plan caps Serverless
// Functions per deployment, and a route per provider was one function too
// many).
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

function isServerRuntime() {
  return typeof globalThis.process !== 'undefined' && !!globalThis.process.versions?.node
}

// One real Groq call — server-side only, real key required. Exported so
// api/ai/proxy.js (the browser-facing proxy) can call this directly: that
// endpoint always runs in Node, so this is exactly the function it needs.
// llama-3.3-70b-versatile (the model this used until now) has been removed
// from this Groq account — confirmed via GET /openai/v1/models returning a
// real model list (so the key itself is fine) that no longer includes it.
// The openai/gpt-oss-* models on this account are reasoning models whose
// actual answer lands in a separate "reasoning" field while "content" stays
// empty until the token budget runs out (finish_reason: "length") — the
// same failure mode already hit and fixed for Gemini's "thinking" models.
// qwen/qwen3.8-27b answers directly (finish_reason: "stop", real content),
// confirmed by testing every available model on this account's key.
export async function callGroqDirect(messages, { model = 'qwen/qwen3.8-27b', max_tokens = 400, temperature = 0 } = {}) {
  const key = globalThis.process?.env?.GROQ_API_KEY
  if (!key) return null
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens, temperature, messages }),
    })
    const data = await response.json()
    if (data.error) {
      console.log('Groq API error:', data.error.message)
      return null
    }
    const text = data.choices[0].message.content
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.log('Groq call failed:', err.message)
    return null
  }
}

async function callGroqViaProxy(messages, options) {
  try {
    const res = await fetch('/api/ai/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'groq', messages, ...options }),
    })
    const data = await res.json()
    return data.ok ? data.value : null
  } catch {
    return null
  }
}

export async function callGroq(messages, options) {
  return isServerRuntime() ? await callGroqDirect(messages, options) : await callGroqViaProxy(messages, options)
}
