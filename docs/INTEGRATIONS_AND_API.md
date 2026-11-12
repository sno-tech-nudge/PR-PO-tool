# Integrations, API routes, environment, storage

Everything the app needs **outside** the database dump. The machine-readable twin of this file is `scripts/migration/inventory.json`; `npm run migration:check` fails if the code and that file disagree.

## 1. Environment variables

| Name | Where it is read | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | browser build, and `api/reminders.js` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser build, and `api/reminders.js` | Public key. Everything the browser does is authorised by database policies (currently open) |
| `GEMINI_API_KEY` | `api/ai/proxy.js` → `src/lib/gemini.js` | Vision/OCR |
| `GROQ_API_KEY` | `api/ai/proxy.js` → `src/lib/groq.js` | Text AI |
| `RESEND_API_KEY` | `api/send-email.js` | Email sending. Missing → the route returns 500 and the app carries on silently |
| `RESEND_FROM_EMAIL` | `api/send-email.js` | From address, must use a Resend-verified domain. Default if unset: `The Nudge Institute <onboarding@resend.dev>` (Resend's sandbox, which only delivers to the account owner) |
| `SLACK_WEBHOOK_URL` | `api/notify-slack.js`, `api/reminders.js` | Slack incoming webhook. Unset → Slack is skipped silently |
| `CRON_SECRET` | `api/reminders.js` | If set, the reminder route demands `Authorization: Bearer <value>` |
| `VERCEL_*` | `vite.config.js` | Build stamp for the System Log (optional) |
| `SUPABASE_DB_URL` | `scripts/migration/*` only | A direct Postgres URL for export/apply. Never used by the deployed app |

`VITE_` variables are baked into the browser bundle at build time: **change them, then rebuild**. Server variables are read at request time.
Values are never in this repository. Browser-visible keys (`VITE_*`) are not secret; the server ones are.

## 2. API routes (all `POST` unless noted; all are plain Node functions `export default async function handler(req, res)`)

### `/api/ai/proxy`

Body `{ provider: "gemini", base64Image, prompt, mimeType? }` → `{ ok, value }` (value = parsed JSON from the model).
Body `{ provider: "groq", messages, model?, max_tokens?, temperature? }` → `{ ok, value }`.
400 for a missing field, 405 for non-POST. Details in `AI_AND_OCR.md`. **Unauthenticated**.

### `/api/send-email`

Body `{ entity: "vendor" | "pr" | "report" | "advance", type, recipientEmail (string or array), …fields }` → `{ ok, id }` from Resend, or `{ error }` with 400/500/502.

| `entity` | `type` values | Other fields | Subject pattern |
|---|---|---|---|
| `vendor` | `submitted`, `approved`, `rejected`, `aadhaar_pan_not_linked`, `review_needed` | `vendorOrgName`, `vendorId` (not needed for `aadhaar_pan_not_linked`), `actorName`, `reason`, `comment`, `panNumber`, `submitterEmail` | "Vendor Submitted: …", "Vendor Approved / Not Approved: …", "Vendor Registration Blocked — Aadhaar/PAN Not Linked: …", "Please review: … registered through your invite link" |
| `pr` | `submitted`, `advanced`, `action_needed`, `rejected`, `finalized` | `prNumber`, `amount`, `actorName`, `reason`, `nextLevelLabel`, `poNumber`, `timelineSteps` | "Purchase Request Submitted / Update / Rejected: PR", "Action Needed — Purchase Request …", "Purchase Order Issued: …" |
| `report` | `submitted`, `advanced`, `action_needed`, `rejected`, `finalized` | `reportReference`, `amount`, `actorName`, `reason`, `nextLevelLabel`, `currentStep` | "Expense Report Submitted / Update / Rejected: REF", "Action Needed — Expense Report …", "Expense Report Reimbursed: …" |
| `advance` | `submitted`, `approved`, `rejected`, `auto_rejected`, `recorded` | `amount`, `description`, `actorName`, `reason` | "Advance Request Submitted / Approved / Rejected / Auto-Rejected / Disbursed: ₹…" |

Every email is HTML plus a text part, in one branded shell (`api/_lib/mailer.js`: header, status badge, optional five-step timeline for reports: Submitted, Under Review, Approved, Processing, Reimbursed). The browser helpers that call it are `vendorEmail.js`, `prEmail.js`, `reportEmail.js`, `advanceEmail.js`. **Unauthenticated**: anyone can make it send mail as the tool.

### `/api/notify-slack`

Body `{ text }` → posts to `SLACK_WEBHOOK_URL`. If the URL is unset it returns `{ ok: true, skipped: true }`. It exists only because Slack webhooks do not allow browser calls. Messages use Slack link syntax `<url|label>`. **Unauthenticated**.

### `/api/reminders` (also `GET` from Vercel Cron)

Runs the daily reminder pass described in `WORKFLOWS.md` §9 and returns `{ ok, reminded: { drafts, pending, rejected } }`. 401 if `CRON_SECRET` is set and the header is wrong; 500 if the Supabase variables are missing.
Writes `expense_notifications` rows and stamps `purchase_requests.last_reminder_at` through the browser anon key.

### Static and routing

`vercel.json` rewrites every path that does not begin with `/api/` to `/index.html` (single-page app), and declares the cron `30 3 * * *` (03:30 UTC, 09:00 IST) for `/api/reminders`.
On another host: serve the built `dist/` as a single-page app with that rewrite, and run the cron by whatever scheduler you have (it just needs to `GET /api/reminders` once a day, with the bearer secret).

## 3. Third-party services

| Service | Use | Notes for a rebuild |
|---|---|---|
| **Supabase** | Postgres, Storage | Required. Use a **new, separate project**; keep production and development apart |
| **Google Gemini** | OCR of receipts and vendor documents | Model alias `gemini-flash-latest`; replaceable by any vision model that returns the JSON shapes |
| **Groq** | Summaries, audit opinion, category hint, policy check | Model `qwen/qwen3.8-27b`; replaceable by any text model |
| **Resend** | Email | The original sending domain is claimed by another Resend team and **still unresolved**: verify a domain you control, or use a subdomain, and set `RESEND_FROM_EMAIL` |
| **Slack** | Notifications | One incoming webhook, one channel |
| **Vercel** | Hosting, cron, build | Optional; anything that serves static files plus Node functions works |
| **Tally** | Accounting | File export only (XML or CSV), no live connection |

## 4. Storage buckets

All **private**; files open through **signed URLs**. The database stores object **paths**, so paths must not change in a move. At the snapshot: 766 files, about 185 MB.

| Bucket | Files | Used for |
|---|---|---|
| `expense-documents` | receipts, payment proofs, supporting attachments | `expense_captures`, `expense_details` |
| `po-pdfs` | generated PO PDFs | `purchase_orders` |
| `pr-quotes` | quotes, comparative statements, advance-approval screenshots | `purchase_requests` |
| `vendor-documents` | PAN, cheque, GST, MSME, registration, Aadhaar documents | `vendors` |
| `feedback-screenshots` | legacy, unused (2 files) | none |

`expense-reports` (report PDFs and the audit trail) is referenced by code but **has never existed**, so those uploads fail quietly and PDFs are generated on demand. Creating it would change behaviour; decide before cutover.
Storage policies and bucket settings are in `docs/database/schema.sql`. The files themselves are in the private data zip under `storage/<bucket>/<path>`.

## 5. Scheduled and background work

| Job | Trigger | What it does |
|---|---|---|
| Reminders | Vercel Cron 03:30 UTC | See `WORKFLOWS.md` §9 |
| Notification bell, list refresh | Browser timers, 15 s | Poll the database |
| Maintenance countdown | Browser timer, 60 s | Re-reads `system_state` |
| Document numbers | Database function `next_doc_number` | On demand, concurrency safe |
| Auto-categories | Database triggers on expense and PR writes | See `BUSINESS_RULES.md` §10 |
| System Log of schema changes | Database event triggers | Applied **last** when loading data |

There is no queue, worker or webhook receiver.

## 6. What is not here

The **Nucleus intake proxy** (`api/intake/*`, `api/_lib/supabaseAdmin.js`, `PR_PO_INTAKE_SECRET`, `INTEGRATION_BRIEF.md`) is deliberately excluded; see `ARCHITECTURE.md`.
No payment gateway, no bank API, no SSO, no SMS.
