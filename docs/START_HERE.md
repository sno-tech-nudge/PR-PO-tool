# Start here: rebuilding the Nudge expense, purchase and vendor tool

This is the entry point for anyone (a person or an AI coding tool) who has to rebuild or migrate this tool on another system.
It tells you what you have, what to read in what order, what must behave exactly the same, and what not to copy.

## What the tool is

The internal finance workflow tool of The Nudge Institute. One web app for:

- **Expenses and reimbursements**: capture a receipt (OCR reads it), build a report, route it for approval, vouch it line by line, pay it.
- **Purchase requests (PR) and purchase orders (PO)**: raise a request with quotes, approve it, issue a PO, pay invoices against it.
- **Vendor registry**: onboarding with KYC documents (OCR reads them), approval, bank details.
- **Advances**: request, approve, record, settle against reports.
- **Control**: roles, approval rules, TDS rules, delegation, activity log, immutable system log, maintenance mode, audit pack.

It is **live and in daily use** by about 470 people. At the last snapshot: about 950 reports, 2,100 expenses, 1,050 PRs, 1,040 POs,
640 vendors. It is not a prototype, so a rebuild must preserve real data and real behaviour.

## What you received

| Package | Contains | Safe to share? |
|---|---|---|
| **Git repository** (and the `CODE_AND_DOCS` zip, which is the same thing plus `docs/database`) | All source code, the API routes, the database schema and functions as SQL, these documents, the migration scripts, the donor mapping sheet | Yes. Scanned for secrets; no personal data |
| **`DATA_PRIVATE` zip** | Every row of the database as SQL, and every stored file (receipts, vendor bank documents, quotes, PO PDFs) | **No. Private.** Contains bank details, PAN and Aadhaar numbers, employee records |

Secrets (API keys, the database password) are in neither package. They are listed in `scripts/migration/inventory.json` and under
"Secrets to provision" below.

## Read in this order

1. **This file.**
2. [`CONTEXT_AND_DECISIONS.md`](CONTEXT_AND_DECISIONS.md): who it is for, how it grew, why it is built the way it is, decisions already made, bugs found, open questions, glossary.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md): the stack, how the app is wired, what to keep and what you may replace.
4. [`BUSINESS_RULES.md`](BUSINESS_RULES.md): every limit, threshold, rule and special case that is specific to this organisation (the "specialisations").
5. [`WORKFLOWS.md`](WORKFLOWS.md): the lifecycle and state changes of every record, notifications and emails.
6. [`ROLES_AND_PERMISSIONS.md`](ROLES_AND_PERMISSIONS.md): who can do what, including the deliberate restrictions.
7. [`AI_AND_OCR.md`](AI_AND_OCR.md) and [`AI_PROMPTS.md`](AI_PROMPTS.md): the OCR and AI pipeline (models, retries, cleaning, fallbacks) and the exact prompts, copied verbatim from the code.
8. [`DATA_MODEL.md`](DATA_MODEL.md) and [`database/`](database/): the schema, explained and as replayable SQL.
9. [`INTEGRATIONS_AND_API.md`](INTEGRATIONS_AND_API.md): API routes, email, Slack, the daily job, environment variables, storage buckets.
10. [`MIGRATION_RUNBOOK.md`](MIGRATION_RUNBOOK.md): the step-by-step move, cutover and rollback.
11. [`PARITY_CHECKLIST.md`](PARITY_CHECKLIST.md) and [`data/parity_vectors.json`](data/parity_vectors.json): how to prove the rebuild behaves like the original, with 50 machine-checkable rule cases.

The root `README.md` is the shorter overview, kept current with every change. Reference data: [`data/`](data/) holds the Finance mapping sheet (entity, programme, sub-programme, location, donor) the donor lists were generated from.

**The chosen target is the existing Nucleus ERP (Lovable, TanStack Start, Cloudflare, Supabase).** Read [`BUILD_INTO_NUCLEUS.md`](BUILD_INTO_NUCLEUS.md): what Nucleus already has, what cannot be copied, the decisions needed, the one check to run on the live Nucleus database, how to load the data safely, build order and cutover. [`REBUILD_ON_LOVABLE.md`](REBUILD_ON_LOVABLE.md) is the generic version for a brand-new, empty Lovable project.

## Two ways to rebuild

**A. Re-host this code on a new Supabase project (exact replica, least work).** Load the database and files, deploy the same code with new
environment variables, run the daily job. Follow `MIGRATION_RUNBOOK.md`. The only code that changes is configuration.

**B. Re-implement in another stack or tool.** Treat the documents above as the specification and the code as the reference
implementation. Keep these exactly:

- the **data model** (table and column meanings, the text "enum" values in use), so existing data loads;
- the **business rules**, **state machines**, **permission rules** and **approval routing** (they encode organisational policy);
- the **OCR prompts and the cleaning of their output** (they were tuned on real Indian receipts and documents);
- the **append-only System Log**, the **document numbering**, and the **Activity Log** entries;
- the **file paths** in storage (the database stores them).

You may freely replace: the React inline-style UI, the Vercel functions, the browser-to-database access pattern, the Supabase client.

## Behaviours that must survive (the short list)

1. A report's route is decided by its **total**: up to ₹2,00,000 Reporting Manager then Finance; above that the Functional Leader joins. It comes from the `approval_rules` table, not from code.
2. Each approval level is actionable **only by its own role**. Not even admin acts out of turn. The one exception is **Finance Admin**, who can act at any level but never on their own request.
3. A PR goes Functional Leader then PR Approver; the Functional Leader is **resolved per requester's function** to one named person. A PO is then created and a Finance member **with the PO switch on** approves and issues it.
4. **TDS is worked out per line item** by the line's category rule; GST and incidentals are never taxed; limits are per bill and yearly limits count per rule.
5. Finance **vouches each line**; a line with an unanswered question blocks approval; duplicates, split bills and GSTIN problems are surfaced, never blocking.
6. Marking a report **reimbursed** changes only reports still `approved`, logs each one, and can skip the employee email.
7. **OCR is best effort and never blocks**: any extraction failure falls back to typing it in.
8. **AI is advisory.** No model approves or rejects anything.
9. The **System Log is append-only** (update, delete, truncate refused) and records schema changes, deployments, team changes, maintenance and downloads.
10. **Document numbers** (`26/27-PR-07-0053`) come from one concurrency-safe counter per kind per fiscal year.
11. A **new category** appears by itself when the same text has been typed under "Other" 5 times; legacy `Zoho category:` text and built-in names never count.
12. **Maintenance mode** hides the app from everyone except admins and can be scheduled.
13. The Activity Log and System Log are **admin only**; Finance Admin never sees them.
14. Money is **INR**, formatted `en-IN`, and the fiscal year runs **April to March**.
15. UI copy is plain and short; the brand is brown with Montserrat and Lato; an English/Hindi toggle exists.

## Do not copy these problems

- **Weak login.** Anyone who knows an employee's email can sign in as them. There is no password or second factor. Replace with real authentication.
- **Open database policies.** Row-level security exists but every policy is `USING (true)`, so anyone holding the browser key can read and write every table. Role checks live only in the UI. Replace with policies by role.
- **No staging environment.** Development ran against the production database. Create a separate one.
- **The report-PDF bucket was never created** (`expense-reports`), so those uploads fail quietly and PDFs are generated on the fly. Decide whether to store them.
- **A save that always failed** (marking reimbursed wrote a column that did not exist) went unnoticed for months. Test the write paths, not just the screens.
- **The Nucleus intake integration** (`api/intake/*`) is intentionally left out. Do not carry it over.
- **Two TDS rules share the category "Other"** and the first wins. Fix the data when rebuilding (see `CONTEXT_AND_DECISIONS.md`).
- **Policy checks test stale entity names** (`NLF FCRA`, `TNF US`) that no entity is called any more, so the FCRA-specific message and the FCRA/TNF notes never fire. Decide the intended behaviour with Finance (`BUSINESS_RULES.md` section 2).
- **Unauthenticated API routes** (AI proxy, email, Slack) can be used by anyone who finds the URL.
- **Some Tally ledger names and the Hindi translations are provisional / unreviewed.**

## Decisions the owner has already made (do not re-ask)

The tool is rebuilt natively inside the Nucleus ERP with all data only in Nucleus's Supabase project, not connected to the old system (`BUILD_INTO_NUCLEUS.md`). Supabase is the database and file store. The API routes and the daily job live in the codebase that moves. The Nucleus integration is out.
The tool must be an **exact replica** first; improvements come after parity. Changes are additive and never alter existing behaviour.
Finance Admin exists and may approve anything except its own requests. PO approval is a per-person switch, as vendor approval is.
TDS applies to line items only. "Other" requires saying what it is. Pending ₹0 means nothing left to pay out.

## Secrets to provision (names only)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (browser build, and read by the daily job); `GEMINI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `SLACK_WEBHOOK_URL`, `CRON_SECRET` (server only). A verified sending domain is needed in Resend (the original domain was
claimed by another Resend team and is still unresolved).

## A ready-to-paste brief for an AI coding tool

> You are rebuilding an internal finance tool from a repository and a set of specification documents. Read `docs/START_HERE.md`, then every
> document it lists, in order, before writing code. The code in `src/` and `api/` is the reference implementation; the documents say what must be
> preserved. Load the database from `docs/database/schema.sql` and the private data package, then deploy. Prove parity with
> `docs/PARITY_CHECKLIST.md`. Do not add features, do not change policy numbers, and do not carry over `api/intake/`. When a document and the code
> disagree, the code is what is live: say so and ask. Never put a secret in a file that is committed.

## Keeping this package current

`npm run handover` re-exports the live database, regenerates `docs/DATA_MODEL.md`, `docs/AI_PROMPTS.md`, `docs/data/parity_vectors.json` and `docs/database/`, and rebuilds both zips into
`db_export_backup/handover/` (gitignored). Add `-- --with-storage` to refresh the stored files too. Run it right before the real move so the data is current.
`npm run migration:check` fails if the code and `scripts/migration/inventory.json` disagree. If you change a business rule, a prompt, a role or a bucket, update the matching document in `docs/` in the same change.
