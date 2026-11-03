# The Nudge Institute: Expense, Purchase and Vendor Tool

The internal finance workflow tool of The Nudge Institute. One web app that handles:

- **Expenses and reimbursements**: capture a receipt, build a report, route it for approval, vouch it, pay it.
- **Purchase Requests (PR) and Purchase Orders (PO)**: raise a request, get quotes approved, issue a PO, pay invoices against it.
- **Vendor registry**: vendor onboarding, KYC and bank details, approval, bank-change requests.
- **Advances**: request an advance, track the balance, settle it against reports.
- **Audit and control**: an activity log, an immutable system log, delegation, maintenance mode, a one-click audit pack.

**This is a live production tool, not a demo.** It holds real employees, vendors and bank details. The state as of
2 Nov 2026: about 940 expense reports, 2,100 expense lines, 1,050 purchase requests, 1,040 purchase orders,
640 vendors, 470 team members.

| | |
|---|---|
| Live app | https://pr-po-tool.vercel.app (Vercel project `pr-po-tool`) |
| Source | GitHub `sno-tech-nudge/PR-PO-tool`, branch `main`. A push to `main` deploys automatically. |

If you are here to **rebuild or migrate** the tool, read [Rebuilding on a new Supabase project](#rebuilding-on-a-new-supabase-project)
and then `scripts/migration/README.md`. Everything needed is prepared there.

---

## Contents

1. [Tech stack](#tech-stack)
2. [Run it locally](#run-it-locally)
3. [Environment variables](#environment-variables)
4. [Roles and access](#roles-and-access)
5. [What the tool does](#what-the-tool-does)
6. [Rules and thresholds](#rules-and-thresholds)
7. [Data model](#data-model)
8. [Backend: API routes and cron](#backend-api-routes-and-cron)
9. [AI features](#ai-features)
10. [Project layout](#project-layout)
11. [Design system](#design-system)
12. [How changes ship](#how-changes-ship)
13. [Rebuilding on a new Supabase project](#rebuilding-on-a-new-supabase-project)
14. [Known gaps, quirks and security posture](#known-gaps-quirks-and-security-posture)
15. [Left out on purpose](#left-out-on-purpose)

---

## Tech stack

| Concern | Choice |
|---|---|
| Frontend | React 19, Vite 8, plain JavaScript (no TypeScript). No router: one `appScreen` state in `src/App.jsx` picks the screen. |
| Styling | Inline styles driven by CSS variables in `src/styles/tokens.css`. Tailwind is installed but the UI does not use classes. |
| Database and files | Supabase: Postgres plus Storage. The browser talks to it directly with the anon key (`@supabase/supabase-js`). |
| Backend | Four serverless functions in `api/` (Vercel format) and one daily cron. No other server. |
| Auth | Custom and deliberately simple: type an authorised email, no password. The email is looked up in `team_members`. Session is `localStorage` key `nudge_user_email`. **Supabase Auth is not used.** |
| AI | Gemini (`gemini-flash-latest`) for reading receipts and documents, Groq for text. Called only through `/api/ai/proxy` so keys stay on the server. |
| Email, chat | Resend for email, a Slack incoming webhook for notifications. |
| PDFs | jsPDF + html2canvas to generate, pdf-lib to merge, pdfjs-dist to read uploaded quotes, JSZip for the audit pack. |
| Offline | IndexedDB queue (`src/lib/offlineQueue.js`) so receipts captured without signal are saved and uploaded later. |
| Hosting | Vercel (static build plus `api/` functions plus a cron). |

## Run it locally

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:5173
npm run lint                    # must show 0 errors before any change is called done
npm run build
```

> **Local dev talks to the production database.** There is no staging project. Everything you click while
> testing is real data. Use test records and delete them afterwards, never test with a real employee's login on
> the live site, and be careful with anything that sends email (submitting a report notifies real approvers).
> Creating a separate dev Supabase project is the single best safety improvement available (see
> [Known gaps](#known-gaps-quirks-and-security-posture)).

Useful local-only switch: setting `localStorage.nudge_dev_maintenance` in the browser (dev builds only) previews the
maintenance screens without touching the database.

## Environment variables

Set these in `.env.local` for local work and in the host's environment settings for production.
The authoritative list is `scripts/migration/inventory.json`, checked against the code by `npm run migration:check`.

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | browser build **and** server | Supabase project URL. The reminders cron also reads it. |
| `VITE_SUPABASE_ANON_KEY` | browser build **and** server | Anon key. Safe to ship to the browser, but note the RLS caveat below. |
| `GEMINI_API_KEY` | server only | Receipt and document reading. No `VITE_` prefix on purpose, so it never reaches the browser bundle. |
| `GROQ_API_KEY` | server only | Text generation (policy explanations, summaries). |
| `RESEND_API_KEY` | server only | Sending email. |
| `RESEND_FROM_EMAIL` | server only | Sender, in the form `The Nudge Institute <address@your-verified-domain>`. Must be on a domain verified in Resend. |
| `SLACK_WEBHOOK_URL` | server only | Slack notifications, forwarded by `api/notify-slack.js` (browsers cannot call Slack directly because of CORS). |
| `CRON_SECRET` | server only | If set, `/api/reminders` requires `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends it automatically. If unset the route is open. |
| `SUPABASE_DB_URL` | local only | Postgres connection string (session pooler) used by one-off scripts and the migration export. Never needed by the running app. |
| `VERCEL_*` | set by Vercel | Commit SHA, message and author are stamped into the build (`__BUILD__` in `vite.config.js`) so each new deployment is recorded in System Logs. |

## Roles and access

Roles live in `team_members.role` and are managed by an admin in **Settings, Team and Roles**.

| Role | What they can do |
|---|---|
| `employee` | Capture expenses, build and submit reports, raise PRs, register or look up vendors, request advances. About 450 people. |
| `fl` (Functional Leader) | Everything an employee can, plus approve PRs at level 1 and reports above the threshold. A person can also be pinned as the named approver for a specific PR. |
| `super_fl` | Functional Leader with wider scope. |
| `pr_approver` | PR approval level 2. |
| `finance` | The Finance dashboard: vouching, TDS, deductions, assignment, reimbursement, Tally export, vendor management. Approving or rejecting vendors additionally needs `team_members.can_approve_vendors`. |
| `coo` | Approval role kept in the code and rules; currently nobody holds it and the COO approval level is retired. |
| `admin` | Everything, including Logs, Settings, delegations and maintenance. Admin is deliberately not delegable. Admin acts at the level it holds, like everyone else: it does **not** get the any-level approval power below. |
| `finance_admin` | An admin's powers over Finance work and Settings (Finance dashboard, vendors, TDS rules, Custom Approval, Categories, Delegations, Analytics, PO audit trail), plus **approving or rejecting at any level** of a report, PR, PO, vendor or advance, never on something they raised themselves. They do **not** see Logs (Activity Log, System Logs, audit pack), maintenance control, or the people list: Settings shows a read-only Team view of only the Finance team, PR approver and Functional Leader roles, with no add, edit or remove. Assigned by an admin in Settings, Team & Roles. |
| `observer` | Read-only. |

Notes that matter when rebuilding:

- `team_members.function` is the person's function (used to route PRs to the right Functional Leader).
- `team_members.linked_email` links two logins of the same human (for example a `thenudge.org` and a `thedelta.org.in`
  account) so "is this my record" checks treat them as one person. Use `isOwnEmail(user, email)` in `src/lib/auth.js`,
  never `=== user.email`.
- `zoho_directory` is a read-only copy of the employee directory (email, name, role, status) used for pickers and lookups.
- **Admin-only screens (Logs) are enforced in the app, not by the database.**
- Use `isAdminLike(role)` in `src/lib/auth.js` where "admin" should include Finance Admin (Finance and Settings powers) and keep
  `role === 'admin'` for Logs, adding or editing people, and maintenance mode. The any-level approval power is `canOverrideApprovals`,
  and `isOwnOverride(user, requesterEmail)` is the "not your own request" guard. Every activity-log entry by a Finance Admin is
  tagged "Acted as Finance Admin". Finance Admin does not get the bell or email notifications for items waiting at a level (those go
  to the people holding the level's role); they find them in Approvals.

## What the tool does

### 1. Expense capture, details and reports

1. **Capture** (`components/capture`): photograph a receipt and, where relevant, payment proof. Gemini reads the vendor,
   amount, date, UPI details and flags an unclear photo or AI-generated content. If the receipt and payment amounts
   differ, the user picks which counts. Works offline.
2. **Details** (`layer2`): category, expense type, purpose, trip, attendees, brand and entity, donor, GST and invoice
   number. Optional fields sit under one "More details" fold; "Claim reimbursement" stays outside it.
3. **Policy check** (`layer3`, `lib/policyEngine.js`): rules run before submission. Violations warn or block and ask for
   a short reason instead of a long form. See [Rules and thresholds](#rules-and-thresholds).
4. **Report builder** (`layer4`): pick saved expenses, build a report, preview it, generate the PDF. Drafts can be deleted.
   The preview also asks whether to deduct from an advance linked to the person.
5. **Submission and tracking** (`layer5`): the report gets a reference (`TNIE<yy>####` for an employee reimbursement,
   `TNIV<yy>####` for paying a vendor invoice against a PO) and a visible journey.

### 2. Approval and Finance

- **Approval routing** is configurable in Settings, Custom Approval (`approval_rules`). The shipped rules: up to
  ₹2,00,000 goes Reporting Manager then Finance; above that adds the Functional Lead. The "Reporting Manager" level is
  not tied to one role: any approver-type person can act on it.
- **Approvers** (`layer5/ApproverDashboard`, `ApproverReportView`) approve, reject with a reason, or send back.
- **Finance** (`layer6`): all reports, vouching, policy violations, analytics, reimbursement batches, Tally export.
- **Vouching** (`layer5/VouchChecklist`, `AccountsPanel`, `VouchQueries`): Finance clears or flags each line, can ask the
  employee a question on a line (approval is blocked while a line awaits the employee), and sees duplicate and
  split-bill warnings plus India tax checks (GSTIN, PAN, TDS). History is stored as events in `expense_vouch_events`.
- **Accounts requirements**: vendor payment versus reimbursement, deductions, TDS (rules editable in Settings, TDS Rules),
  advance application, work assignment to a Finance person, and "lower of invoice or proof amount".
- **Invoice split and TDS** (`layer5/AccountsPanel`, `lib/tds.js`, `lib/paymentSplit.js`): a vendor invoice is split into
  line items (each with its own category and therefore its own TDS rule), incidentals and GST. Only the line items are
  taxed; GST and incidentals never are, and incidentals are whatever is left of the invoice total. The split is filled in
  from the linked purchase request's line items (scaled to the invoice, so a part payment keeps the same proportions),
  else from the items the employee listed, else one line, and Accounts can edit it. What was confirmed is saved per line
  in `expense_details.tds_breakdown` and shown to Finance any time as the "Payment split" card (vouching panel, admin
  report detail, approver card for Finance) and in the audit pack's expenses file. TDS on the advance part of a PO
  (`po/PoAdvanceTds`) uses the same per-line logic.
- **AI vouch check** (`AIVouchCard`) gives an advisory verdict that is saved on the report.
- **Needs you** strip on Home shows what is waiting for the signed-in person.

### 3. Purchase Requests and Purchase Orders

- A **PR** (`components/pr`) is raised for a purchase of ₹25,000 and above: vendor (must be an approved vendor), line items,
  quotes, comparative statement, budget, advance terms, donor allocations, purpose.
- **PR approval chain** is fixed: Functional Leader, then PR Approver. After final approval a PO is created.
- **PO** (`components/po`): Finance approves and issues it (`pending_approval`, `issued`), then it ends as `completed`,
  `cancelled` or `rejected`. A PO has a generated PDF and can be exported. Vendor invoices are paid by raising a report
  against the PO (`SubmitPOExpense`), with the PO balance tracked.
- **Reminders**: a daily cron nudges stale draft PRs, PRs waiting for an approver and rejected PRs.
- **Document numbers** look like `26/27-PR-07-0053` (fiscal year, kind `PR`, `PO` or `VR` for vendor registration, a fixed
  `07` segment, a 4-digit counter). They are issued by the database function `next_doc_number`: one counter per kind per
  fiscal year, safe under concurrent use.

### 4. Vendors

- A vendor is registered in-app or by a **public invite link** (`vendor_invites`, token with expiry, no login needed).
- Captured: organisation and contact details, PAN, GSTIN, MSME, registration, Aadhaar and Aadhaar-PAN link status, bank
  details and cancelled cheque. Documents are read by AI to prefill fields. Duplicate PAN, organisation name and account
  number are warned about but never block a submission.
- Status: `draft`, `pending`, `approved`, `rejected`. Only an approved vendor can be used on a PR.
- **Bank-change requests** keep the old and new details and need approval (`vendor_bank_change_log`).

### 5. Advances

Request an advance (`advances`), approver sign-off, a ledger and live balance. Reports can be settled against one or
more advances (`report_advances`, oldest first). The balance always shows what is left as reports and invoices are
deducted.

### 6. Admin, audit and control

- **Logs** (admin only) has two views. **Activity Log** is what people did (approvals, submissions, rule changes),
  with CSV and PDF export. **System Logs** records changes to the system itself: schema changes, new deployments,
  team changes, maintenance windows and every download of records. It is **append-only**: update, delete and truncate
  are refused by database triggers and revoked privileges.
- **Audit pack**: one button bundles the reports, receipts, vouch history, activity and system logs for a date range
  into a single zip.
- **Maintenance mode**: an admin can start it now or schedule it. While active, everyone except admins sees a
  maintenance page; admins keep full access and can end it. Used to freeze writes during releases or a migration.
- **Delegation / out of office** (`approval_delegations`): an approver names a teammate for a date range; the delegate
  can act on their pending items and the trail records "on behalf of".
- **Settings**: Team and Roles, Custom Approval rules, TDS rules, Categories (what grew out of Other), Delegations, My Profile.
- **Language**: an English / Hindi toggle (`src/lib/i18n`). It swaps visible text at runtime from a dictionary
  (`hi.js`); anything not in the dictionary stays English. Hindi strings have not been reviewed by a native speaker.
- **First-time walkthrough** and guided tours (`lib/walkthrough.js`, `lib/tours.js`, `shared/GuidedTour.jsx`). Everyone gets the
  Home tour on their first visit; the Finance role gets its own 7-step tour instead (where notifications arrive, where to approve
  expense reports, PRs, POs and vendors, how vouching works, and how to mark payments reimbursed). Each step points at an element
  tagged `data-tour-anchor`; the sidebar items carry `nav-<screen>` and the bell `notif-bell`. A tour is remembered per browser under
  its own key (`nudge_tour_<name>_seen_v1`, Home keeps `nudge_walkthrough_seen_v1`) and can be replayed from Help in the account
  menu. Add a tour for another role by adding its steps in `tours.js` and a case in `tourForRole`. Admins currently get the Home tour.

## Rules and thresholds

Business rules are code (`src/lib/policyEngine.js` and friends) unless noted. Changing one means changing the code.

| Rule | Value |
|---|---|
| Report needs the Functional Lead as well | total above ₹2,00,000 (`approvalThreshold.js`; also editable as rules in Settings) |
| PR required | purchase of ₹25,000 or more |
| Quotes required | 2 for ₹25,000 to ₹2,00,000; 3 above ₹2,00,000. A single-source justification can replace quotes. |
| Advance on a PR | over 30% is flagged; 100% needs the Functional Leader's email acknowledgement |
| Hotel | ₹4,000 per person per night in metro cities, ₹3,250 elsewhere (plus GST) |
| Food | ₹750 per person per day (people counted from the headcount the filer gives) |
| Personal vehicle | per-km rate by vehicle type; claim above rate times distance is flagged |
| Air travel | boarding pass required |
| Large claim on FCRA entity | above ₹20,000 needs a donor or programme mention (hard block); other entities get a soft prompt |
| Late claim | an expense more than 30 days old shows a warning; exceptions need Functional Leader and COO approval |
| Company card | an expense paid on a company card cannot be marked reimbursable (database trigger) |
| TDS | rules table (`tds_rules`): section, categories, payee type, rate, no-PAN rate, thresholds. Starter rules for 194J and 194C are marked "Starter". A rule is picked by each line item's category. A rule with **no limit set applies to every bill**; with a limit, TDS applies when one bill is over the single limit or the vendor's payments under that rule this financial year pass the yearly limit (the year's total is counted per rule, so another section's payments do not count). Lines under the same rule on one bill are added together before the single-bill limit is checked. Only one rule can win per category and payee type, so do not put two rules on the same category. |
| Expense categories | 24 built-in categories in one shared list, `src/lib/expenseCategories.js`, used by the expense forms and the TDS rule picker. The PR and PO dropdowns use `src/lib/prConstants.js` (`PR_CATEGORIES`), so a new built-in category must be added to **both**, plus a Tally ledger in `tallyExport.js` and a Hindi label in `i18n/hi.js`. "Machinery & Plants", "Prize Challenge" and "Hiring" were added on 2 Nov 2026. On top of those, **categories grow out of "Other"** (below). Every picker reads the merged list through `useCategories()` in `src/lib/categories.js`. |
| "Other" | Choosing Other asks what it is: typed into `expense_details.sub_category` (the expense form, Quick add, the PO invoice form), as `other` on an itemized line or a TDS split line, or as the item description on a PR line item (required there). Finance and approver screens, the report PDF and exports show "Other (what it is)". |
| Categories made from Other | When the same text is typed under Other **5 times** (editable in Settings, Categories, stored in `system_state` key `category_auto`) the database makes it a category by itself (`custom_categories`), named after its most common spelling. Counted: expense lines, itemized lines and submitted (not draft) PR line items. Not counted: the legacy `Zoho category: ...` text already in `sub_category`, existing built-in names (so "machinery and plants" never duplicates "Machinery & Plants"), vague words (other, misc, general, ...) and anything over 40 characters or 5 words. Spelling, case, plurals and "and" are ignored when matching. Past records are never rewritten. Finance and admin get a notification and an Activity Log entry; Settings, Categories lists what was made, what is close, and can hide one. A new category has no TDS rule until one is added. |

## Data model

27 tables in the `public` schema. The exact definitions are in a fresh export (`npm run migration:export`); the
`supabase_migration_*.sql` files in the repo root are history only and do **not** add up to the live schema.

| Area | Tables |
|---|---|
| People | `team_members`, `zoho_directory`, `approval_delegations` |
| Expenses | `expense_captures` (the receipt and payment proof), `expense_details` (one expense, about 70 columns, including `tds_breakdown`: the per-line TDS split of a vendor invoice), `expense_reports`, `report_expenses` (report to expense link), `report_approvals`, `expense_vouch_events`, `expense_notifications` |
| Money | `advances`, `report_advances`, `tds_rules` |
| Procurement | `purchase_requests`, `pr_approvals`, `pr_review_presence`, `purchase_orders` |
| Vendors | `vendors` (about 60 columns), `vendor_invites`, `vendor_bank_change_log` |
| Control | `approval_rules`, `custom_categories` (categories made from Other), `activity_log`, `system_logs`, `system_state` (key/value: the maintenance state, and `category_auto` the threshold), `audit_trail_access_log`, `feedback` (table remains, the UI was removed) |

Conventions:

- Multi-value fields (attendees, line items, quotes, donor allocations, policy flags) are `jsonb` or text arrays on the row.
- "Enums" are plain text columns. Report status: `draft`, `submitted`, `under_review`, `approved`, `rejected`. PR status:
  `draft`, `submitted`, `approved`, `rejected`, `po_generated`. Vendor status: `draft`, `pending`, `approved`, `rejected`.
- Net payable on a report is `net_payable`, with `advance_applied`; the payout is `net_payable - advance_applied`.

**Database functions and triggers** (all in `public`):

- `next_doc_number(kind, fy_prefix)`: issues PR, PO and VR numbers. It creates one sequence per kind per fiscal year on
  first use (`doc_seq_pr_26_27`, `doc_seq_po_26_27`, `doc_seq_vr_26_27`), seeding it from existing rows. It is
  `SECURITY DEFINER` and uses an advisory lock, so the role that owns it must be allowed to create sequences.
- `enforce_company_card_not_reimbursable`: trigger on expenses.
- `log_team_member_change`: trigger on `team_members`, writes a System Log row when someone is added, removed or has their
  role, vendor-approval right, function, name or email changed. The app stamps `changed_by` / `changed_at` just before the
  change so the log can name who did it; a change with no fresh stamp is recorded as a "direct database change".
- `system_logs_refuse`: triggers on `system_logs` that reject update, delete and truncate.
- `promote_other_category(text)`, `category_key(text)`, `jsonb_arr(jsonb)` and the triggers `promote_other_expense` (on
  `expense_details`) and `promote_other_pr` (on `purchase_requests`): count what is typed under Other and create the
  category when it is frequent enough. They never raise, so a failure cannot stop a save. The built-in category names are
  repeated inside `promote_other_category`; if a built-in category is ever added, add it there too.
- `log_ddl_command`, `log_ddl_drop`: **event triggers** (`system_log_ddl`, `system_log_drop`) that record every schema
  change in the `public` schema into System Logs.

**Storage buckets** (all private, files are opened through signed URLs):

| Bucket | Holds |
|---|---|
| `expense-documents` | receipts, payment proofs, supporting attachments |
| `vendor-documents` | PAN, cheque, GST, MSME, registration and Aadhaar documents |
| `pr-quotes` | quotes, comparative statements, advance approval screenshots |
| `po-pdfs` | generated PO PDFs |
| `feedback-screenshots` | legacy, unused now |

The code also refers to an `expense-reports` bucket for report PDFs. **It has never existed on the live project**, so
those uploads fail quietly and report PDFs are generated on the fly instead.

## Backend: API routes and cron

| Route | Purpose |
|---|---|
| `api/ai/proxy.js` | The browser's only path to Gemini and Groq. Dispatches on `provider`. Imports `src/lib/gemini.js` and `groq.js`. |
| `api/send-email.js` | Builds and sends the branded emails (vendor, PR and report status mails) through Resend. |
| `api/notify-slack.js` | Forwards a message to the Slack webhook. |
| `api/reminders.js` | The daily cron target. Reminds stale draft PRs, PRs pending an approver (respecting active delegations), and rejected PRs. Writes `expense_notifications`, posts to Slack, and stamps `last_reminder_at` so nobody is nagged twice in a day. |
| `api/_lib/mailer.js` | Shared Resend helper and email layout. |

`vercel.json` schedules `/api/reminders` at `30 3 * * *` (03:30 UTC, 09:00 IST) and rewrites every non-`/api` path to
`index.html`. Vercel caps the number of serverless functions per plan, which is why AI calls share one route.

## AI features

All model calls go through `src/lib/claude.js` (the name is historical; it now calls Gemini and Groq).

- **Reading documents** (Gemini): receipts, payment screenshots, cheques, PAN, GST, MSME and registration certificates,
  vendor quotes, invoices. Prompts ask for strict JSON. The receipt prompt also reports `ai_generated`, shown as a
  small "AI content" label when the model is sure.
- **Text** (Groq): short explanations of policy flags, manager and PR summaries, category suggestions, the AI vouch check.
- AI is **advisory**. Nothing is approved or rejected by a model; people decide.
- Model names are set in `src/lib/gemini.js` and `src/lib/groq.js`. Providers retire models, so check those two files first
  when extraction suddenly fails.

## Project layout

```
api/                      serverless functions (see Backend)
src/
  App.jsx                 shell: login, sidebar, appScreen switch, maintenance gate, polling
  components/
    capture/              receipt and payment capture (layer 1)
    layer2/               expense details and saved-expense list
    layer3/               policy check screens
    layer4/               report builder, preview, PDF
    layer5/               submission, approver views, vouching, status
    layer6/               Finance and admin dashboards, analytics, Tally, reimbursement
    pr/  po/  vendor/     procurement and vendor modules
    advance/              advances
    audit/                Logs hub, Activity Log, System Logs, audit pack, PO audit trail
    settings/             team and roles, approval rules, TDS, delegations, profile
    shared/               small reusable pieces (inputs, badges, banners, tours, language toggle)
    auth/                 login screen
  lib/                    all business logic: approvalEngine, policyEngine, vouch, tds, assignment,
                          delegation, systemLog, activityLog, auditPack, tallyExport, offlineQueue, i18n, ...
  styles/tokens.css       design tokens
public/                   favicon, comparative-statement templates
scripts/migration/        everything needed to rebuild on a new Supabase project
supabase_migration_*.sql  history of schema changes (not a complete schema)
```

Where to look first for a given question:

| Question | File |
|---|---|
| Who sees which menu item? | `src/App.jsx` (`navItems`), `src/lib/auth.js` |
| Why did this expense get flagged? | `src/lib/policyEngine.js` |
| Who approves this report or PR? | `src/lib/approvalEngine.js`, `src/lib/prApprovalActions.js`, `approval_rules` |
| How is a document number made? | database function `next_doc_number` |
| What is recorded in System Logs? | `src/lib/systemLog.js` and the database triggers |
| Where do entity, programme, sub-programme and donor come from? | `src/lib/donorData.js`. The generated part is rewritten from the mapping sheet with `node scripts/gen-donor-map.cjs "<path to the CSV>"` (do not edit it by hand). The sheet's Location column is not a form field: `getLocation()` looks it up from the donor and `LocationTag` shows it small and blue next to the sub-programme for approvers (PR detail, request card, PR review step). It shows nothing when a donor sits in several places (today: FCRA, SAY, "Unrestricted"). The old TNF entity is not in the sheet and is kept in `LEGACY` so older records resolve. |

## Design system

A warm, brown-led brand ("Proof System"). Tokens in `src/styles/tokens.css`: logo brown `--brown-900` `#36201a` (also
`--surface-hot`), `--brown-700` for ink and actions, taupe neutrals, moss and clay accents. Fonts: Montserrat and Lato
(self-hosted in `src/assets/fonts`). Use the CSS variables, not raw colours. The login screen and the maintenance page use
the brown surface.

## How changes ship

The working pattern for this project:

1. Make the change and verify it on local dev (`npm run dev`) against test data.
2. `npm run lint` must show **0 errors** (a large number of older warnings exist).
3. Commit the exact files that changed (do not `git add -A`: the working tree can hold large local files).
4. Push to `main`. Vercel builds and deploys automatically (about 30 to 60 seconds); confirm the deployment is Ready.
5. Each deployment is recorded in System Logs with its commit.

**Database changes** are applied directly to the live database (there is no migration runner). The convention: write the
SQL as `supabase_migration_<topic>.sql` in the repo root for the record, apply it with a short one-off script using
`SUPABASE_DB_URL`, then delete the script. The files in the root are therefore a history, not a replayable schema. After
a schema change, run `npm run migration:export` to refresh the rebuild pack. Event triggers log every `public` schema
change automatically.

**Housekeeping rules**: never commit `.env*`, `db_export_backup/` (real bank details) or any plaintext credential.

## Rebuilding on a new Supabase project

Everything for an exact replica is prepared under [`scripts/migration/`](scripts/migration/README.md):

| File | Role |
|---|---|
| `README.md` | The step-by-step runbook and smoke-test checklist. Start here. |
| `export-db.cjs` | Read-only export of the **live** schema, data and storage list into `db_export_backup/migration_pack/` (gitignored). |
| `apply-db.cjs` | Loads that export into an empty new project and checks every row count. Refuses to run against the live project. |
| `copy-storage.cjs` | Copies every file in every bucket, keeping the same paths (the database stores them). |
| `inventory.json` | Everything outside the database: API routes, cron, env vars, buckets. |
| `check-inventory.cjs` | `npm run migration:check` fails if the code and the inventory disagree. |

Summary of the procedure:

1. Create an empty Supabase project (same or newer Postgres major version).
2. Freeze writes on the live tool using maintenance mode, then `npm run migration:export` so the data is final.
3. `apply-db.cjs` with `TARGET_DB_URL`. This creates the schema, loads the data, restores sequence positions and
   last of all installs the event triggers (so the migration itself is not logged as a schema change).
4. `copy-storage.cjs` with the new project's URL and service-role key.
5. Deploy this repo with the environment variables above pointing at the new project, and make sure the host runs
   `api/*.js` as functions and calls `/api/reminders` daily (with `Authorization: Bearer <CRON_SECRET>`).
6. Smoke test (old report opens with its attachments, new document numbers continue the old sequence, System Logs show
   the history and refuse edits), then switch over and end maintenance.

Why you cannot just replay the repo's SQL files, and what the export captures that they miss: policies, triggers, the
log lock, grants and event triggers were partly applied by ad hoc scripts. A test replay of the export into a scratch
Postgres matched all 26 tables (there are 27 now) row for row and kept the log lock and both event triggers intact.

**What the export deliberately does not copy:** Supabase's own `issue_*` and `pgrst_*` event triggers and the
`pg_stat_statements` and `supabase_vault` extensions (every new project has them), and the Nucleus integration (below).

## Known gaps, quirks and security posture

Read these before treating the tool as hardened. They are carried over unchanged by an exact replica.

- **Weak login**: access needs only an authorised email, no password and no second factor. Anyone who knows an employee's
  email can sign in as them.
- **Open database policies**: row-level security is enabled but the policies are `USING (true)`, so any browser holding the
  anon key can read and write every table. Role gates (including admin-only Logs) are enforced only in the app.
  Real fixes: Supabase Auth or signed sessions plus policies by role.
- **No staging**: local dev and production share one database.
- **Report PDFs are not stored**: the `expense-reports` bucket does not exist (see above).
- **Direct SQL edits are not logged as data changes**: System Logs record schema changes, deployments, team changes,
  maintenance and downloads, not arbitrary row edits made in SQL.
- **Rule overlap to check**: `approval_rules` row 3 is named "Retired: COO level (not used)" but is still `is_active`
  and overlaps row 2 for amounts above ₹2,00,000. Confirm which one the router actually picks before relying on it.
- **Resend sending domain is unresolved**: `thenudge.org` is claimed by another Resend team, so a verified sender and a
  fresh API key are still needed before email is reliable.
- **Hindi translation** is unreviewed by a native speaker.
- **Some category lists and Tally ledger names are provisional** pending Finance's final chart of accounts
  (`TODO(finance)` comments in `prConstants.js` and `tallyExport.js`). The ledgers for the newest categories were
  chosen by the developer, not Finance: Machinery & Plants maps to "Plant and Machinery", Prize Challenge to "Prize and
  Challenge Expenses", Hiring to "Recruitment Expenses". Confirm or change them in `DEFAULT_LEDGER_MAP`.
- **Older TDS rules use workaround categories**: the 194BB prize rule and the 194I plant and machinery rent rule are both
  attached to "Other", and the 194I(2) rent rule to "Lodging and Boarding". When two rules cover the same category the
  first one wins, so "Other" is taxed as a prize. They were not changed; move them onto Prize Challenge, Machinery &
  Plants and a rent category in Settings, TDS Rules. There is no "Rent" category yet.
- **Before 2 Nov 2026 a rule with no limits never charged TDS** (the code treated "no limit" as "below the limit", while
  Settings says it applies to every bill). Fixed that day. Lines already confirmed before then keep what was saved.
- `INTEGRATION_BRIEF.md` is an older hand-over note written for a different platform and describes an earlier stack
  (Groq only, React 19 as a drop-in). Treat it as history; this README is current.

## Left out on purpose

The **Nucleus intake-proxy** integration (`api/intake/*`, `api/_lib/supabaseAdmin.js`, `PR_PO_INTAKE_SECRET`) was a way
for the Nucleus ERP to submit vendors and PRs and read status. It is not part of the rebuild by decision (2 Nov 2026).
The code remains in this repository for now; nothing in the app depends on it. The only trace in the database is
`purchase_requests.source` and `vendors.source` (default `app`), which drive a "Submitted through Nucleus" tag.
