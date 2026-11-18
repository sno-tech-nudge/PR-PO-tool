# Migration runbook: move this tool to a new Supabase project

Goal: an exact replica of the live tool on a fresh Supabase project, with the API routes and the daily
cron running from this codebase. The Nucleus intake-proxy is deliberately left out (see `inventory.json`).

Nothing here writes to the live database. The export is read-only.

**The full, current runbook is [`docs/MIGRATION_RUNBOOK.md`](../../docs/MIGRATION_RUNBOOK.md)** (start at `docs/START_HERE.md`).
This file is the quick reference for the scripts in this folder:

| Command | What it does |
|---|---|
| `npm run handover` | Export, regenerate the docs, build the two zips (`CODE_AND_DOCS`, `DATA_PRIVATE`) and checksums into `db_export_backup/handover/`. Flags: `-- --skip-export`, `-- --with-storage` |
| `npm run migration:export` | Read-only export of schema, data, sequences, event triggers, storage list |
| `npm run migration:docs` / `migration:prompts` / `migration:vectors` | Regenerate `docs/DATA_MODEL.md`, `docs/AI_PROMPTS.md`, `docs/data/parity_vectors.json` |
| `npm run migration:storage` | Download every stored file to `db_export_backup/migration_pack/storage/` |
| `node scripts/migration/verify-pack.mjs` | Replay the export into an in-memory Postgres and compare row counts (touches nothing real) |
| `node scripts/migration/apply-db.cjs` | Load the export into an empty new project (`TARGET_DB_URL`) |
| `npm run migration:upload-storage` | Upload the downloaded files into the new project (`TARGET_SUPABASE_URL`, `TARGET_SERVICE_ROLE_KEY`) |
| `node scripts/migration/copy-storage.cjs` | Direct project-to-project file copy while the old project is still reachable |
| `npm run migration:nucleus-schema` / `migration:nucleus-verify` | Generate `docs/database/nucleus_schema.sql` and prove it on a scratch Postgres shaped like Nucleus |
| `node scripts/migration/apply-nucleus.cjs` | Load tables and data into the Nucleus project (guards: `CONFIRM_PROJECT_REF`, clash pre-flight, empty-table check). `--dry-run`, `--schema-only`, `--data-only` |
| `node scripts/migration/port-to-nucleus.mjs --nucleus <path>` | Port the tool's logic (`src/lib`) into a Nucleus checkout as `src/modules/expenses/lib/`, unchanged except imports and server-route seams, with a manifest and the parity test. Re-run after any rule change in this tool. See `docs/BUILD_INTO_NUCLEUS.md` section 11 |
| `npm run migration:check` | Fail if the code and `inventory.json` disagree |

## What is where

| Piece | Source of truth | How it moves |
|---|---|---|
| Tables, functions, triggers, RLS, grants, event triggers, bucket definitions | the **live database** | `export-db.cjs` regenerates it on demand, so it is always current |
| Rows | the live database | `02_data.sql` from the same export |
| Files (receipts, quotes, PO PDFs, vendor docs) | live storage buckets | `copy-storage.cjs`, same bucket and path |
| API routes, cron, env vars, bucket names | this repo | listed in `inventory.json`, guarded by `npm run migration:check` |
| Frontend | this repo | deploy as is, point it at the new project |

The `supabase_migration_*.sql` files in the repo root are history only. Do not replay them: several changes
were applied straight to the live database, so the export is the only complete schema.

## Before cutover (can be done any time, repeat as often as needed)

```bash
npm run migration:check      # confirms inventory.json still matches the code
npm run migration:export     # writes db_export_backup/migration_pack/ (gitignored: contains bank details)
```

Output files: `01_schema.sql`, `02_data.sql`, `03_sequences_setval.sql`, `04_event_triggers.sql`,
`storage_inventory.json`, `summary.json` (row counts, what was found).

## Cutover steps

1. **Create the new Supabase project.** Same or newer Postgres major version as the live one. Keep it empty.
2. **Freeze writes on the live tool.** Use Settings, System Logs, maintenance, so only admins can still log in.
   Then re-run `npm run migration:export` so the data is final.
3. **Load the database** (needs the new project's Postgres connection string, session pooler on port 5432):
   ```bash
   TARGET_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" node scripts/migration/apply-db.cjs
   ```
   It refuses to run against the live project or a non-empty target, applies the four files in order, and
   checks every table's row count against the export.
4. **Copy the files:**
   ```bash
   TARGET_SUPABASE_URL="https://<ref>.supabase.co" TARGET_SERVICE_ROLE_KEY="<service role key>" node scripts/migration/copy-storage.cjs
   ```
   Failures, if any, are written to `storage_copy_failures.json`. Re-run until it is empty.
5. **Deploy the code** (this repo) to the new host with these environment variables, from `inventory.json`:
   - Browser build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the NEW project's)
   - Server: `GEMINI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SLACK_WEBHOOK_URL`, `CRON_SECRET`
   - The host must run `api/*.js` as serverless functions and call `/api/reminders` daily at 03:30 UTC
     (`vercel.json` does this on Vercel; elsewhere set up the equivalent scheduler with the `CRON_SECRET` header).
6. **Smoke test** (see below), then switch the domain / tell people the new address, then end maintenance.

## Smoke test on the new system

- Sign in as an admin and as an employee. Open an old report with attachments (confirms files and paths).
- Create a draft expense, upload a receipt, confirm it saves and the file opens.
- Run a PR through approval; confirm the document number continues from the old sequence (the next one after `26/27-PR-07-0052`, not `...-0001`).
- Settings, System Logs: confirm the old entries are there and that a new change adds a row.
- Try editing a System Logs row through SQL: it must be refused (the lock moved with the schema).
- Send one email (Resend) and one Slack notification; confirm `/api/reminders` runs.

## Known differences and decisions

- **Resend domain**: `thenudge.org` is still unresolved on the Resend side. Emails will not send until a verified
  domain and key exist. Not a migration problem, but it blocks the email smoke test.
- **`expense-reports` bucket** is used by code but never existed on the live project, so report PDFs have never
  been saved. The replica copies that as is. Creating the bucket on the new project is the fix, and a behaviour
  change: decide before cutover. Details in `inventory.json`, `known_gaps`.
- **Security carried over unchanged**: login is email-only and RLS policies are `USING (true)`, so the anon key can
  read and write everything. An exact replica has the same exposure.
- **Function execute privileges** are not exported; they use the Postgres default. Nothing in the app relies on
  anything different.
- Event triggers `issue_*` / `pgrst_*` and the `pg_stat_statements` / `supabase_vault` extensions are Supabase's
  own; every new project already has them.

## Keeping this current

- The database part cannot go stale, because it is regenerated from the live database at export time.
- For everything else: after adding, removing or renaming an API route, cron, env var or storage bucket, update
  `inventory.json` and run `npm run migration:check`. It fails with a plain list of what drifted.
- Re-run `npm run migration:export` right before any real migration, never reuse an old export.
- If the export script itself needs a change (a new kind of database object), replay it to prove it loads: the
  last full replay (all 26 tables matching, log lock intact, both event triggers present) passed on 2026-11-02.
