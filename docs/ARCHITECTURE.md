# Architecture

## Shape of the system

```
 Browser (React single page app)
   │  supabase-js with the public anon key                    ┌────────────────────────────┐
   ├────────────────────────────────────────────────────────► │ Supabase                   │
   │   reads and writes the tables directly                   │  Postgres (27 tables,      │
   │   uploads/downloads files (signed URLs)                  │   functions, triggers)     │
   │                                                          │  Storage (5 private buckets)│
   │  fetch('/api/…')                                         └────────────▲───────────────┘
   ▼                                                                       │ anon key
 Four serverless routes (Vercel functions, Node)                           │
   /api/ai/proxy      ► Gemini (vision/OCR) and Groq (text)                │
   /api/send-email    ► Resend (vendor, pr, report, advance emails)        │
   /api/notify-slack  ► Slack incoming webhook                             │
   /api/reminders  ◄── Vercel Cron, daily 03:30 UTC ──────────────────────┘
```

There is **no application server and no ORM**. The browser is the application: it queries and updates Postgres directly, and enforces every business rule itself.
The four `api/` routes exist only to hold secrets (AI keys, Resend key, Slack URL) and to run the one scheduled job.

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, Vite 8, plain JavaScript (`.jsx`), **inline styles** plus CSS variables from `src/styles/tokens.css`; Tailwind 4 is installed but barely used |
| Routing | **None.** One `appScreen` state value in `src/App.jsx` (about 1,250 lines) selects the screen; a `SCREEN_PARENT` map decides which nav tab is highlighted. Deep links use `?type=pr|po|report|vendor&id=<id>` (read once on load) |
| Data | `@supabase/supabase-js` in the browser (`src/lib/supabase.js`) |
| Files | Supabase Storage |
| Server | Vercel serverless functions in `api/` (ES modules); one cron |
| PDF | `jspdf` + `html2canvas` (generate), `pdf-lib` (merge attachments), `pdfjs-dist` (render page 1 for OCR), `jszip` (exports) |
| AI | Gemini (vision), Groq (text) via `/api/ai/proxy` |
| Email, chat | Resend, Slack webhook |
| Lint | ESLint 10 with react-hooks and react-refresh rules. `npm run lint` must report 0 errors |
| Hosting | Vercel project `pr-po-tool` (`vercel.json`: one cron, and a rewrite that sends every non-`/api/` path to `index.html`) |

Scripts: `dev`, `build`, `lint`, `preview`, plus the migration set (`migration:check`, `migration:export`, `migration:docs`, `migration:storage`, `migration:prompts`, `handover`).
`vite.config.js` stamps the build with the Vercel commit, author and time (`__BUILD__`); the app records a new deployment in the System Log from that.

## Repository map

```
index.html, vite.config.js, vercel.json, eslint.config.js, package.json
api/                    the 4 routes + _lib/mailer.js (email shell and Resend call)
                        (api/intake/* and _lib/supabaseAdmin.js are the Nucleus integration: NOT part of this system, see below)
src/main.jsx            mounts <App/>
src/App.jsx             session, maintenance gate, navigation, every screen switch, deep links
src/index.css           global styles;  src/styles/tokens.css  design tokens + self-hosted fonts
src/assets/             fonts (Montserrat, Lato), logos
src/hooks/              useIsMobile, useNetworkStatus, useFileDrop, useVoiceDictation, useFormTour
src/lib/                all logic, no UI (see below)
src/components/         screens, grouped by area
public/                 favicon, comparative-statement templates (docx/pdf) offered for download on PRs
scripts/                gen-donor-map.cjs (CSV to donorData.js);  migration/ (the handover tooling)
docs/                   this documentation
supabase_migration_*.sql   40 historical SQL patches, kept for reference only; docs/database/schema.sql is the authoritative schema
README.md               overview;  INTEGRATION_BRIEF.md  historical Nucleus integration notes (out of scope)
```

### `src/components/` by area

| Folder | What it holds |
|---|---|
| `capture/` | New expense: receipt step, payment-proof step, cross-validation, quick-add, offline banner |
| `layer2/` | Expense details, list, history, bulk add, itemisation, brand/entity and donor selection, attendee count |
| `layer3/` | Policy check screens: loading, violation, flag, result, approval route preview, submitted |
| `layer4/` | Building a report: selector, workspace, preview and submit, PDF template, advance-deduction prompt, rejection banner |
| `layer5/` | Approver and employee views of a report: dashboard, report view, vouch checklist and queries, AI vouch card, timelines, notifications |
| `layer6/` | Finance: dashboard, all reports, report detail, reimbursement batch and modal, analytics, policy violations, Tally export, PR list for Finance |
| `pr/`, `po/` | Purchase requests and orders: form, quotes, detail, approver dashboard, PO template and PDF, invoice capture, advance TDS |
| `vendor/` | Vendor form (with OCR), list, detail, approval, invites, public registration, bank change, PDFs |
| `advance/` | Request, list, ledger, approver dashboard and decision |
| `settings/` | Team & Roles, approval rules, TDS rules, categories, delegations, profile, directory |
| `audit/` | Activity Log, System Logs, audit trail, audit pack |
| `auth/`, `shared/` | Login screen; notification bell, toasts and shared widgets |

("layer N" is the order the original expense flow was built in, not a technical layering.)

### `src/lib/` by purpose

| Purpose | Files |
|---|---|
| Access and identity | `auth.js`, `delegation.js`, `functionRouting.js`, `directory.js`, `approverRecipients.js` |
| Policy and rules | `policyEngine.js`, `policyPrompt.js`, `approvalEngine.js`, `approvalThreshold.js`, `taxChecks.js`, `duplicateCheck.js`, `vendorMatch.js`, `linkEngine.js` |
| Money | `tds.js`, `deductions.js`, `formCalc.js`, `paymentSplit.js`, `poBalance.js`, `advanceBalance.js`, `advanceValidation.js`, `numberFormat.js`, `numberToWords.js`, `reimburse.js`, `tallyExport.js` |
| Categories and data lists | `expenseCategories.js`, `prConstants.js`, `categories.js`, `donorData.js` (generated), `orgEntities.js`, `vendorData.js`, `paymentModes.js` |
| Records and numbering | `reportReference.js`, `reportDelete.js`, `expenseDelete.js`, `expenseDetailsSave.js`, `prApprovalActions.js`, `assignment.js`, `vouch.js`, `tat.js` |
| AI and documents | `claude.js` (the extractors; the name is historical, it calls Gemini and Groq), `gemini.js`, `groq.js`, `receiptImage.js`, `imageQuality.js`, `receiptHash.js`, `aiContent.js` |
| Output | `pdfGenerator.js`, `pdfMerge.js`, `poBundle.js`, `poTermsAndConditions.js`, `vendorProfilePdf.js`, `expenseAttachmentsPdf.js`, `exportUtils.js`, `activityLogExport.js`, `systemLogExport.js`, `auditPack.js` |
| Messaging | `prEmail.js`, `reportEmail.js`, `advanceEmail.js`, `vendorEmail.js`, `vendorNotifications.js`, `slack.js` |
| Logging | `activityLog.js`, `systemLog.js`, `auditTrail.js` |
| Platform | `supabase.js`, `fetchAllRows.js` (pages past the 1,000-row API limit), `offlineQueue.js`, `dateFormat.js`, `numericInput.js`, `tours.js`, `walkthrough.js`, `i18n/` |

## Cross-cutting behaviour

- **Direct database access.** Components call `supabase.from(table)…` themselves. There is no repository layer; to find where a table is written, search for its name.
  `fetchAllRows.js` exists because the API returns at most 1,000 rows per request.
- **Polling, not realtime.** Lists refresh every 15 s (Pending approvals, PR/PO/vendor lists, vouch checklist and queries, report status), the notification bell every 15 s, maintenance status every 60 s. No websockets.
- **Soft concurrency.** `pr_review_presence` records who is looking at a PR and heartbeats every 15 s so two approvers see "someone else is reviewing". There is no locking; the last write wins.
- **Offline capture.** `offlineQueue.js` stores receipts in IndexedDB (`nudge-offline`) when there is no connection and uploads them later (`useNetworkStatus`, `OfflineBanner`).
- **Local storage keys:** `nudge_user_email` (session), `nudge_lang_v1` (language), `nudge_sidebar_collapsed`, tour-seen flags (`tours.js`), a dev-only maintenance override.
- **Language.** `i18n/engine.js` swaps visible text for Hindi at runtime from a dictionary (`hi.js`) using a MutationObserver; anything not in the dictionary stays English. Not threaded through components.
- **Tours.** First-visit walkthroughs per role (`tours.js`, `walkthrough.js`, `useFormTour`): employees, and a seven-step one for Finance.
- **Design.** Brown brand colour, Montserrat headings and Lato body (self-hosted), tokens in `src/styles/tokens.css`; mobile layouts via `useIsMobile`. See the design-system skill in the owner's tooling if you have it.
- **PDF generation is in the browser** (report PDF, PO PDF, vendor profile, audit pack). Nothing renders on a server.
- **Environment.** Browser code reads `import.meta.env.VITE_*`; server routes read `process.env.*`. `src/lib/gemini.js` and `groq.js` pick direct-call or proxy by checking whether Node is present.

## What to keep and what you may replace

| Keep exactly | Replace freely |
|---|---|
| Table and column meanings, text "enum" values, document numbering, system-log immutability | The UI framework and inline styling |
| Business rules, state machines, routing, permissions | The browser-direct data access pattern (a real API layer is better) |
| OCR prompts and output cleaning | Vercel functions (any server or edge runtime) |
| Storage paths | Polling (realtime is fine) |
| Activity Log events and System Log entries | Resend, Slack (any email or chat provider, same triggers) |

## The Nucleus integration (excluded on purpose)

`api/intake/*`, `api/_lib/supabaseAdmin.js`, `PR_PO_INTAKE_SECRET` and `INTEGRATION_BRIEF.md` belong to an earlier plan to let another internal system (Nucleus) create PRs and vendors through a secret-protected proxy.
The owner decided on 2026-11-02 not to carry it over. The files remain in the repository (removing them changes the live app) but **a rebuild must not include them**. The only trace in the data is `source = 'nucleus'` on one PR; it only drives a "Submitted through Nucleus" tag.

## Known weak points (fix in a rebuild, do not copy)

1. Open database policies and email-only sign-in (see `START_HERE.md`).
2. Unauthenticated `/api/ai/proxy`, `/api/send-email` and `/api/notify-slack`: anyone who finds the URL can spend AI budget or send email and Slack messages as the tool.
3. `/api/reminders` is open when `CRON_SECRET` is unset.
4. Business rules duplicated in the AI audit prompt and in `policyEngine.js`; category lists duplicated in three AI prompts and two constants files.
5. `App.jsx` is a 1,250-line switch; any rebuild with a real router will be easier to reason about.
6. No automated tests; the parity checklist is the substitute.
