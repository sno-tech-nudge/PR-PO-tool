# AI and OCR

Everything the tool reads with a model, how it is called, how the answer is cleaned, and what happens when it fails.
**The exact prompts are in [`AI_PROMPTS.md`](AI_PROMPTS.md)**, copied verbatim from the source by a script, so they cannot drift. Use that file when you
re-implement; this one explains the design around it.

## Principles (keep all of these)

1. **Best effort, never a gate.** Reading a document can fail (bad photo, model down, timeout). Every caller treats a `null` result as "type it in
   yourself". No extraction failure may block a submission.
2. **Advisory only.** No model approves, rejects or pays anything. AI output is a pre-fill, a hint, or a summary for a human.
3. **Deterministic.** Temperature 0 on both models, JSON-only output, so the same document gives the same answer.
4. **Clean before use.** Model output is validated before it reaches a form (invalid GSTIN dropped, payment mode limited to a known set, and so on).
5. **No keys in the browser.** The browser calls our own server route; only the server holds the model keys.
6. **Say what the AI filled.** Pre-filled vendor fields carry a green "read from document" tag so a person knows to check them.

## Two models, one route

| Job | Model | Why |
|---|---|---|
| Reading images and PDFs (OCR) | **Google Gemini**, `gemini-flash-latest` (the "latest" alias, deliberately: Google retires dated versions) | Needs vision. The Groq account had no vision-capable model (every model was tested) |
| Text only (summaries, audit, category, policy check) | **Groq**, `qwen/qwen3.8-27b` | Fast and cheap; answers directly. The previously used `llama-3.3-70b-versatile` was removed from the account; `openai/gpt-oss-*` put the answer in a hidden field and ran out of tokens |

Either can be swapped for another provider. What must be preserved is the **contract**: JSON in the shapes in `AI_PROMPTS.md`, `null` for anything not visible.

### Gemini call settings (`src/lib/gemini.js`)

- Endpoint `…/v1beta/models/gemini-flash-latest:generateContent`.
- One request = the image (`inline_data`, MIME type `image/jpeg` unless told otherwise) **then** the prompt text.
- `temperature: 0`, `responseMimeType: "application/json"` (forces valid JSON at decode time), `thinkingConfig.thinkingBudget: 0`, `maxOutputTokens: 4096`.
  Thinking was switched **off** because the model spent its whole token budget "thinking" on dense documents and returned nothing. That was the real cause of most
  early extraction failures, not image quality. If you change model, test this.
- **12 second timeout per attempt, 3 attempts** (so up to about 36 seconds, then `null`).
- A reply that is empty, blocked, truncated or not valid JSON counts as a failed attempt. Markdown fences are stripped defensively before parsing.

### Groq call settings (`src/lib/groq.js`)

- Chat completions endpoint, `temperature: 0`, per-call `max_tokens` (400 default; 150 policy, 200 PR summary, 50 category, 400 manager summary, 900 audit).
- Fences stripped, then `JSON.parse`. Any error returns `null`. **No retries.**

### The proxy route (`api/ai/proxy.js`)

One serverless route serves both providers (`provider: "gemini" | "groq"`). It exists so the browser never sees a key. It runs the model call in Node and returns
`{ ok, value }`. (A single route also kept the project under the Vercel function limit.) **Known weakness: the route has no authentication and accepts a
`model` field from the caller**, so anyone who finds the URL can spend the AI budget. When you rebuild, require a signed-in user and fix the model on the server.

## Where each reader is used

| Reader | Used by | Purpose |
|---|---|---|
| `extractReceiptData` | Step 1 receipt capture, Quick add dropzone, Bulk add | Pre-fills amount, vendor, date, category, invoice number, GSTIN, payment mode, card last 4, and the AI-generated flag |
| `checkDocumentQuality` | Receipt and payment-proof steps | Warns when a photo is unreadable (blurry, dark, cropped) |
| `detectUPI` | New expense, payment-proof step | Recognises a UPI screenshot and reads amount, recipient, transaction id, date, app |
| `extractPaymentAmount` | Payment-proof step | Reads the debited amount from a UPI screenshot, bank or card SMS |
| `extractChequeDetails` | Vendor form | Beneficiary, account number, IFSC, bank, branch, address |
| `extractPanCardDetails` | Vendor form | PAN, name, date of birth or incorporation |
| `extractRegistrationCertDetails` | Vendor form | CIN / LLPIN / registration number, name, organisation type, incorporation date, state, address |
| `extractGstCertDetails` | Vendor form | GSTIN, legal name, address, phone, email |
| `extractMsmeCertDetails` | Vendor form | Udyam number, category, enterprise name, activity |
| `extractVendorQuote` | PR quote upload | Vendor, quote number, date, line items, subtotal, tax, total |
| `extractInvoiceDetails` | PO invoice capture | Invoice number, vendor, date, total, tax |
| `suggestCategory` | Expense form (confirm step and details) | Suggests a category from a vendor name |
| `generateManagerSummary` | Approver report view | One-screen summary and an approve/review hint for the approver |
| `runAIVouchCheck` | Finance report detail, AI vouch card | An audit opinion per expense and overall, saved on the report |
| `generatePRSummary` | PR submit | A two-sentence summary for the PR approver |
| `checkNonReimbursableAI` | Policy engine, expenses over ₹500 | Second opinion on non-reimbursable items |

## Cleaning the receipt answer (`tidyReceiptData`)

- `gstin`: upper-cased, spaces removed, **dropped unless it matches the 15-character GSTIN pattern** (`GSTIN_FORMAT_RE` in `src/lib/formCalc.js`).
- `invoice_number`: trimmed; empty becomes `null`.
- `ai_generated`: true only when the model returned exactly `true`.
- `payment_mode`: lower-cased; anything other than `cash`, `card`, `upi`, `online` becomes `null`.
- `card_last4`: digits only; kept only if exactly four.
- The category the model chooses is one of a fixed list inside the prompt. **That list lacks the three newest categories** (Machinery & Plants, Prize Challenge, Hiring)
  and auto-created ones, so the model will not suggest them; the person picks. `suggestCategory` has the same gap, and the policy prompt has an older, different
  category list. Update all three together when you add categories.

## Client-side preparation (before anything is sent)

- **Images** (`src/lib/receiptImage.js`): scaled so the longest side is at most **2000 px**, re-encoded as **JPEG quality 0.92**, sent as base64 without the data-URL prefix.
  A vision model reads a 2000 px image about as accurately as a 4000 px phone photo, and the smaller upload does not stall.
- **PDFs**: the **first page** is rendered with `pdfjs-dist` (scale capped at 2.5, longest side 2000 px) to a JPEG the same way. Only page 1 is read.
- **Hash** (`src/lib/receiptHash.js`): SHA-256 of the stored image, saved as `expense_captures.receipt_hash`; powers the "same receipt used before" duplicate check.
- **Unreadable explanation** (`src/lib/imageQuality.js`): used only **after** the reader returned nothing, to tell the person why. Works on a 480 px greyscale copy:
  `blank` if the standard deviation is under 8, `dark` if the mean brightness is under 40, `blurry` if the variance of a Laplacian is under 12, otherwise nothing. Thresholds are deliberately low
  so only clearly unusable photos are named.
- **Offline**: receipts taken without signal queue in IndexedDB (`nudge-offline`) and upload later; reading happens when they are online.

## The "AI content" label (`src/lib/aiContent.js`)

A small label for images that are clearly AI-generated, deliberately cautious (a wrong label on a real bill is worse than a missed one) and **never blocking**.
It fires on either of two strong signals only:

1. The **original file's** embedded metadata (first 400 KB and last 200 KB, JPEG/PNG/WebP) contains the standard "trained algorithmic media" source tags, or a known
   generator's name (Midjourney, DALL-E, Stable Diffusion, Firefly, SynthID, Imagen, Ideogram, Leonardo.Ai, Flux.1, Craiyon, NightCafe). Read on the file as picked, because
   the re-encoded copy has lost it. PDFs are skipped.
2. The receipt reader returned `ai_generated: true`, which the prompt allows only when it is certain; blurry, dark, crumpled, handwritten, screenshot and scanned bills are explicitly *not* AI.

Result is `'metadata'`, `'model'` or nothing.

## Vendor document flow

On each upload in the vendor form the matching reader runs; returned fields fill the empty inputs and get the green tag; anything unreadable stays for the person to type.
Validation rules (PAN pattern, IFSC pattern, PIN, mobile) run on the form regardless of whether the AI or the person supplied the value.
Aadhaar documents are **not** OCR'd: only the number is typed and its link status recorded.

## The audit check (`runAIVouchCheck`)

Sends one line per expense (vendor, category, amount, date, payment method, invoice number or MISSING, GSTIN, description, personal/team with headcount, system flag) plus
the policy text, and asks for a verdict per expense (`pass | warn | flag`), an overall verdict (`approve | query | flag`) with confidence, and audit notes. Saved on the report
(`ai_vouch_*` columns) so it is not recomputed. Its embedded policy text duplicates some numbers from the policy engine (hotel ₹3,250/₹4,000, meals ₹750, 30 days,
₹20,000 FCRA). **If a policy number changes, change it in both places.**

## Failure behaviour

| Situation | What the user sees |
|---|---|
| Gemini times out or errors 3 times | The form stays empty for that document; the person types. A "could not read" note appears, with a reason if the image is blank, dark or blurry |
| Groq fails | The summary, audit or suggestion is simply absent; nothing else changes |
| Model returns invalid GSTIN | Field left empty |
| Keys missing on the server | Same as failure; the app still works by hand |

## When you rebuild

- Keep the prompts verbatim first; improve only after parity is proven against a set of real receipts.
- Keep `temperature 0` and JSON-only output. If your provider supports a schema, use the shapes in `AI_PROMPTS.md`.
- Re-test with **dense multi-page invoices and photos taken at an angle**; those are what broke the first version.
- Do not call a model from the browser with a key. Authenticate the proxy.
- Collect a small set of real documents (receipt, hotel bill, UPI screenshot, cancelled cheque, PAN, GST certificate, Udyam certificate, quote) as a regression pack; see `PARITY_CHECKLIST.md`.
