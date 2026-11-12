# Rebuilding this tool in Lovable: step by step

> **Building into the existing Nucleus ERP? Use [`BUILD_INTO_NUCLEUS.md`](BUILD_INTO_NUCLEUS.md) instead.** This page assumes a brand-new, empty Lovable project and a new Supabase project. Do **not** run its database steps against Nucleus: the load script would bring in open-to-everyone policies and, on a database that already has tables, is meant to refuse.

For the person doing the rebuild. You have a **GitHub repo link**, the **CODE_AND_DOCS zip** (same as the repo) and, if you are allowed to have it, the **DATA_PRIVATE zip** (real data: bank details, PAN, Aadhaar; do not share it onward, and never upload it to a chat).

## First, what Lovable can and cannot do

Lovable is a prompt-driven builder. It writes its own React app and runs its backend on **Supabase** (database, storage, Edge Functions). It does **not** run this repo's `api/` folder (those are Vercel functions), and it cannot load a database dump or upload stored files. So the work splits in two:

- **You do, outside Lovable** (Part 1): create the Supabase project, load the data and files, add secrets, set the daily job, verify the email domain.
- **Lovable does, from your prompts** (Part 2): rebuild the screens and logic on top of that database, using the docs and the original code as the specification.

Lovable rebuilds from a description; it does not copy code. "As it is" therefore depends on checking the result against `PARITY_CHECKLIST.md`. If you need a true, byte-for-byte copy of today's tool, use Route A in `MIGRATION_RUNBOOK.md` instead: deploy this same code (Vercel or similar) against the new Supabase project.

## Part 1: what only you can do (cannot be done from the repo or inside Lovable)

1. **Create the Lovable project** and connect it to GitHub so the repo and `docs/` are visible to it. (If Lovable cannot import an existing repo, put the repo's `docs/` folder and `src/lib/` folder into your Lovable project's repository by hand: they are what Lovable needs to read. Check Lovable's current import options; they change.)
2. **Create a NEW, empty Supabase project** and connect it through Lovable's Supabase integration. Use the same or a newer Postgres version than the old project. Do not reuse the old project.
3. **Load the database. Do this before asking Lovable to build anything.** On a computer with Node installed:
   - Unzip the code zip, run `npm install`.
   - Unzip the DATA_PRIVATE zip and copy its contents into `db_export_backup/migration_pack/` inside the code folder.
   - Get the connection string from Supabase (Project, Connect, **Session pooler**, port 5432) and run:
     ```bash
     TARGET_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" node scripts/migration/apply-db.cjs
     ```
   - It loads schema, data, counters and the log lock, then checks every table's row count. It stops if the target is not empty.
4. **Upload the stored files** (receipts, vendor documents, quotes, PO PDFs) with the same script folder:
   ```bash
   TARGET_SUPABASE_URL="https://<ref>.supabase.co" TARGET_SERVICE_ROLE_KEY="<service role key>" node scripts/migration/upload-storage.cjs
   ```
   Re-run until it reports 0 failures. The file paths must not change; the database refers to them.
5. **Add the secrets in Supabase** (Edge Functions, Secrets), never in a Lovable chat: `GEMINI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SLACK_WEBHOOK_URL`, `CRON_SECRET`.
6. **Verify an email domain in Resend** that you control (the original domain is tied up with another Resend team). Set `RESEND_FROM_EMAIL` to an address on it. Until then no email sends; nothing else breaks.
7. **Schedule the daily reminder job** after Lovable has created it as an Edge Function: Supabase, Cron (or `pg_cron`), every day at 03:30 UTC, calling the function with the `CRON_SECRET`.
8. **Decide on sign-in.** The original lets anyone in with just a work email. In Lovable use real Supabase Auth, and make row-level security follow `ROLES_AND_PERMISSIONS.md`. Do this before real staff use it.
9. **Publish** and, if wanted, attach your own domain in Lovable.

## Part 2: what to tell Lovable (in this order, one step per prompt)

Start the first prompt with: *"Read `docs/START_HERE.md` and every document it lists. The database and storage already exist and contain real data. Do not create, drop or alter any table or policy. Generate the typed client from the existing schema. Do not add features. Do not build anything from `api/intake`."* Then, one at a time, and test each before the next:

1. **Sign-in and roles**: `ROLES_AND_PERMISSIONS.md`, `src/lib/auth.js`.
2. **Expenses and OCR**: `AI_AND_OCR.md`, `AI_PROMPTS.md` (use the prompts **verbatim**), `BUSINESS_RULES.md` section 2. Ask for the AI calls as an Edge Function so the keys stay on the server.
3. **Reports and approvals**: `WORKFLOWS.md` section 2, `BUSINESS_RULES.md` section 3, `src/lib/approvalEngine.js`.
4. **Finance** (vouching, deductions, TDS, reimbursement, Tally): `BUSINESS_RULES.md` sections 7 to 10, `src/lib/tds.js`.
5. **PR and PO**: `WORKFLOWS.md` section 3, `BUSINESS_RULES.md` sections 4 and 5, the donor mapping in `docs/data/`.
6. **Vendors**: `WORKFLOWS.md` section 4, `BUSINESS_RULES.md` section 13.
7. **Advances, delegation, logs, maintenance**: `WORKFLOWS.md` sections 5 to 11.
8. **Email, Slack, reminders as Edge Functions**: `INTEGRATIONS_AND_API.md` gives the exact request shapes.

**Best way to stay exact:** paste the logic files from `src/lib/` (policyEngine, tds, approvalEngine, prApprovalActions, duplicateCheck, taxChecks, vouch, and the rest of that folder) into the Lovable project **unchanged** and tell Lovable to use them rather than rewrite them. They are plain JavaScript with no framework dependency, so they carry the rules over exactly. Lovable then only has to rebuild the screens.

## Part 3: prove it

Run `docs/data/parity_vectors.json` through the rebuilt logic, then work through `PARITY_CHECKLIST.md` with test users for each role. Do not let staff in until every box is ticked or an exception is accepted by the owner.

If you get stuck on something Lovable cannot do (large file loads, cron, secrets), it is a Supabase dashboard or command-line task, not a prompt.
