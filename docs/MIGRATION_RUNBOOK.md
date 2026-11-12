# Migration runbook

How to move the tool to a new system, end to end. Two routes:

- **Route A: same code, new Supabase project** (an exact replica; recommended first step even if you plan to change things later).
- **Route B: a different database, host or stack** (re-implementation).

Read `START_HERE.md` first. Commands assume a terminal at the root of the unzipped code package (or a clone of the repository).

## 0. What you have

| Item | Where |
|---|---|
| Code, docs, scripts | the git repository, or `nudge-tool_CODE_AND_DOCS_<date>.zip` |
| Schema as SQL | `docs/database/schema.sql` (tables, functions, triggers, policies, grants, bucket rows) |
| Sequence positions, event triggers | `docs/database/sequences_setval.sql`, `docs/database/event_triggers.sql` |
| All rows, all files | `nudge-tool_DATA_PRIVATE_<date>.zip`: `01_schema.sql`, `02_data.sql`, `03_sequences_setval.sql`, `04_event_triggers.sql`, `storage_inventory.json`, `summary.json`, `storage/<bucket>/<path>` |
| Checksums | `SHA256_<date>.txt` (verify both zips before use) |
| Secrets | **not included.** Create new keys; names in `INTEGRATIONS_AND_API.md` |

The data is a **snapshot** taken on the day printed in the zip name. For a real cutover, rebuild the packages from the live system immediately beforehand (section 8).

## 1. Prepare the workspace

```bash
# unzip the code package (or git clone), then:
npm install                                   # installs app dependencies and the migration tools (pg, PGlite)
mkdir -p db_export_backup/migration_pack
# unzip the PRIVATE package and copy its contents (not the outer folder) into db_export_backup/migration_pack/
```

Check the package is complete and loads, **without touching any real system**:

```bash
node scripts/migration/verify-pack.mjs        # replays the SQL into an in-memory Postgres; every table must match, system_logs must refuse edits
```

Expected: `ok 01_schema … ok 04_event_triggers`, `ok all 27 tables match the export row for row`, three `ok blocked`, `ok event triggers present`.

## Route A: new Supabase project, same code

### A1. Create the target

Create a **new, empty** Supabase project, same or newer Postgres major version as the live project (shown in its Settings, Infrastructure). Do not reuse the old project. Note the project URL, the `anon` key, the `service_role` key, and the database connection string (session pooler, port 5432, or the direct string).

### A2. Load the database

```bash
TARGET_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" node scripts/migration/apply-db.cjs
```

It refuses to run against the source project or a target that already has tables, applies `01` to `04` **in order** (the order matters: schema, data, sequences, event triggers last, otherwise the log-lock triggers would record the load), then compares every table's row count with `summary.json`.

What the load recreates: 27 tables, 11 functions, triggers, 30 row-level-security policies (28 public, 2 on `storage.objects`), grants, 5 bucket rows, the append-only lock on `system_logs`, and the two event triggers. Supabase's own event triggers (`issue_*`, `pgrst_*`) and the `pg_stat_statements` and `supabase_vault` extensions are already on every project, so they are not copied.

### A3. Load the files

The buckets now exist (created by the schema step). Upload every file with its **exact path** (the database stores paths):

```bash
TARGET_SUPABASE_URL="https://<ref>.supabase.co" TARGET_SERVICE_ROLE_KEY="<service role key>" node scripts/migration/upload-storage.cjs
```

Re-run until `storage_upload_failures.json` is empty (it is safe to repeat). If the old project is **still reachable**, `copy-storage.cjs` does a direct project-to-project copy instead and needs no zip.
Expected: 766 files, about 185 MB (at the snapshot).

### A4. Configure and deploy the code

Set these in the new host's environment (names from `INTEGRATIONS_AND_API.md`):

- **Build time (browser):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, from the **new** project.
- **Server:** `GEMINI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SLACK_WEBHOOK_URL`, `CRON_SECRET`.

Deploy: `npm run build` produces `dist/`; serve it as a single-page app (every path that is not `/api/` returns `index.html`) and run `api/*.js` as Node functions. On Vercel this is automatic (`vercel.json`). Elsewhere, schedule a daily `GET /api/reminders` at 03:30 UTC with header `Authorization: Bearer <CRON_SECRET>`.
Do **not** deploy `api/intake/*` (Nucleus; excluded on purpose). Removing those files from the new repository is fine.

### A5. Email domain

Resend must have a **verified sending domain**. The original (`thenudge.org`) is claimed by a different Resend team and is unresolved. Verify a domain you control (a subdomain such as `mail.<domain>` works), then set `RESEND_FROM_EMAIL` to an address on it. Until then no email sends; nothing else is affected.

### A6. Smoke test, then verify parity

Run the quick list below, then the full `PARITY_CHECKLIST.md`.

- Sign in as an admin, an employee and a Finance member (use real addresses from `team_members`).
- Open an old report with attachments and an old PO PDF (proves files and paths).
- Create a draft expense, upload a receipt, confirm OCR pre-fills (proves the AI proxy and keys).
- Start a PR; confirm the next number continues the sequence (the one after the highest existing `26/27-PR-07-NNNN`, not `0001`).
- In Settings, System Logs: old entries present; a new change adds a row; `update`/`delete` on `system_logs` through SQL is refused.
- Send one email and one Slack message; call `/api/reminders` once manually.

### A7. Cutover

1. Announce and **start maintenance mode** on the old system (Settings, System Logs, Maintenance) so only admins can sign in.
2. Rebuild the packages from the old system (section 8) so the data is final.
3. Load into a **fresh** target project (A2, A3). If rehearsals used an earlier project, create another or reset it; `apply-db.cjs` will not overwrite.
4. Deploy against the new project (A4); run the smoke test (A6).
5. Point the people's address (domain or bookmark) at the new deployment. Keep the old one in maintenance mode, read-only, for at least two weeks.
6. Tell people to sign in again (their browser keeps the email only).

**Rollback:** until step 5 nothing changed for users. After it, point the address back, end maintenance on the old system, and discard anything entered on the new one (or re-enter it by hand; there is no merge).

## Route B: a different database, host or stack

1. **Database.** The schema is plain Postgres plus three Supabase specifics. If your target is Postgres:
   - roles `anon`, `authenticated`, `service_role` appear in `GRANT` and `CREATE POLICY ... TO` lines: create them (`create role anon nologin;` etc.) or rewrite the grants;
   - the `storage` schema (`storage.buckets`, `storage.objects`) is Supabase Storage: remove those lines and the two storage policies, and handle files separately;
   - extensions `pgcrypto`, `uuid-ossp` are standard; `pg_stat_statements` and `supabase_vault` can be dropped.
   `verify-pack.mjs` shows exactly which lines it strips to load into a plain Postgres, a good starting point.
2. **Load order is mandatory:** schema, data, sequences, event triggers (last).
3. **Files.** Put `storage/<bucket>/<path>` into your object store keeping the same relative paths, and change the code that creates signed URLs. Keep the five bucket names or map them.
4. **Server code.** Port the four routes (`INTEGRATIONS_AND_API.md` gives their exact contracts) and the daily job. Add authentication to all of them.
5. **Security.** Replace the open database policies and email-only login (`ROLES_AND_PERMISSIONS.md`) with real authentication and server-side checks **before** exposing it to staff. The tool holds bank details, PAN and Aadhaar numbers.
6. **Behaviour.** Re-create every rule in `BUSINESS_RULES.md` and `WORKFLOWS.md`, the OCR prompts in `AI_PROMPTS.md`, and the permission matrix. Prove it with `PARITY_CHECKLIST.md`.

## Things that do not move by themselves

- **People's sessions** (browser local storage): everyone signs in again.
- **Tours seen** (browser local storage): everyone sees the first-visit tour again; harmless.
- **Offline-queued receipts** in someone's browser that were never uploaded: tell people to upload before the cutover.
- **Slack channel and webhook, Resend domain, AI keys:** new accounts or keys on the new side.
- **Function execute privileges** are not exported; they use the Postgres default. Nothing relies on anything different.

## Known differences and decisions

- `expense-reports` bucket does not exist on the live project; creating it on the new one would make report PDFs and audit-trail files start saving. A behaviour change: decide before cutover (default: do not).
- Login and policies are carried over unchanged in Route A (same exposure as today).
- The mapping sheet, TDS rules, approval rules and Team & Roles are **data in the database**; they arrive with it.
- Data issues worth fixing after parity, not during: `approval_rules` row 3 "Retired: COO level" is still active; TDS sections for Prize (194BB) and rent (194I) share the category "Other"; 906 approved reports have never been marked reimbursed.

## 8. Refreshing the packages from the live system

On a machine with the old project's connection string in `.env.local` as `SUPABASE_DB_URL` (read-only use):

```bash
npm run handover -- --with-storage      # export, data model doc, prompts doc, storage download, both zips
npm run handover -- --skip-export       # rebuild the zips from what is already on disk (docs changed only)
```

Output is `db_export_backup/handover/` (gitignored): the two zips and `SHA256_<date>.txt`. The export only reads. `npm run migration:check` confirms the inventory still matches the code.
