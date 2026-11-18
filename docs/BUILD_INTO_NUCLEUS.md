# Building this tool into Nucleus (the existing Lovable ERP)

Read this **instead of** the "new project" steps in `REBUILD_ON_LOVABLE.md`. The target is not an empty project: it is **Nucleus** (T/NI 360), a live internal ERP that already has real users, a database, authentication and a design system.
What follows comes from reading the Nucleus repository (`Anurag-TNI/tni-nucleus`, `main`) and this tool's docs. Anything marked **CHECK** could not be confirmed from the code and needs a person to look.

**Settled by the owner (12 Nov 2026):**
- The tool is rebuilt **completely inside Nucleus**, as a native module.
- **All data lives only in Nucleus's Supabase project.** Nothing stays in the old tool's project.
- **The two systems are not connected**: no relay, no shared database, no calls between them, no sync. The old tool keeps running on its own until cutover and is then retired.
- Treat Nucleus as if it **never had a PR, PO or vendor module**. Whatever Nucleus holds from an earlier, abandoned attempt (section 1) is leftover to remove, not something to build on.

## 1. What Nucleus is (verified from its repo)

| Area | Fact |
|---|---|
| Stack | TanStack Start (React 19) on Vite, **TanStack Router** (file routes in `src/routes/`, `routeTree.gen.ts` is generated: never edit), Tailwind 4 with Radix/shadcn components, TypeScript. Deployed on **Cloudflare Workers** (`wrangler.jsonc`), edited through Lovable, auto-committed to `main` on GitHub. Other people commit to `main` at the same time |
| Backend | **Supabase** (Postgres, Storage, Edge Functions in Deno under `supabase/functions/`, each with `verify_jwt` set in `supabase/config.toml`). Migrations are in `supabase/migrations/` |
| Sign-in | Real **Google OAuth through Supabase**. Identity and role come from the `employees` table: `erp_role` (`super_admin`, `admin`, `manager`, `member`), `managed_module`, `manager_id`, `department_id`, `is_finance_admin`. Helper SQL functions already exist: `current_employee_email`, `is_finance_admin`, `is_functional_lead`, `has_finance_access`, `expense_is_finance`, `expense_is_manager` |
| Modules | `src/lib/nav-items.ts` (`NAV`) is the single source for menu items; `src/lib/access.ts` (`canSeeModule`, `useModuleAccessGuard`) decides who sees a module. **Expenses is currently a launch gate: super admin plus the module's manager only.** A Finance module with dashboards already exists |
| Leftovers to remove | **State of `origin/main` on 18 Nov 2026** (the earlier reading was of a checkout 478 commits behind): the old intake screens are already gone, and `/expenses` is an empty placeholder page ("The Nucleus Expenses module is being rebuilt"). Still present: the edge function `intake-proxy`, the table `intake_submissions` and its migration, `src/lib/donorData.ts` and `src/lib/prConstants.ts` (TypeScript copies of this tool's lists), and a July 2026 migration (`20260705185851`) that creates early stub versions of this tool's tables; the live generated types do **not** list those stubs, so they do not exist in the database. Delete the first four when the module is built; nothing is wired to the old tool |
| OCR | An edge function `ocr-receipt` already calls Gemini (`gemini-2.5-flash`, `GEMINI_API_KEY`). It is simpler than this tool's reader. Replace it with the prompts in `AI_PROMPTS.md` |

Nucleus's `NAV` already has an Expenses item and a Finance item; the new module can take over those slots.

## 2. What cannot be copied, and what can

- **Screens cannot be pasted.** This tool is a Vite React app with inline styles and no router; Nucleus is TanStack Router, TypeScript and its own design system. Every screen is **rebuilt** in Nucleus's components and routes from `WORKFLOWS.md`, `BUSINESS_RULES.md` and the original screens. Mobile layout and the Nucleus PWA shell (`PwaShell`) must be respected.
- **Logic can be ported nearly verbatim.** `src/lib/*.js` here is plain JavaScript with no framework dependency (policy engine, TDS, approval engine, vouching, duplicate and GSTIN checks, numbering use). Port each file to TypeScript in Nucleus (`src/lib/` or a new `src/modules/expenses/`), keep the functions and constants unchanged, and run `docs/data/parity_vectors.json` against them. **This is what keeps the rules exact.**
- **The four `api/` routes do not run on Nucleus.** Cloudflare Workers and Lovable use Supabase Edge Functions. Re-create them as functions (AI proxy, email, Slack, reminders) per `INTEGRATIONS_AND_API.md`, with `verify_jwt` on (the original had no authentication). Schedule reminders with Supabase Cron at 03:30 UTC.
- **Sign-in is replaced, not copied.** The original's "type an email" lookup in `team_members` goes away. Users come from Google sign-in and `employees`.

## 3. Decisions needed before building (owner to answer)

1. ~~Where does the data live?~~ **Settled: only Nucleus's Supabase project.**
2. **Table names** (default, to confirm). This tool's 27 tables keep **exactly the same names and columns** in Nucleus's `public` schema, so the data model doc, the ported logic and the load script apply 1:1. Because Nucleus is to be treated as never having had this module, any same-named leftover stubs are dropped first. **CHECK (section 4)** that they are empty before dropping anything.
3. **Role mapping** (tool role to Nucleus identity). Proposal, to confirm with Finance:

   | Tool role | In Nucleus |
   |---|---|
   | employee | any `employees` row |
   | fl, super_fl | `is_functional_lead`, plus a per-function mapping (`functionRouting`) or a `functional_lead_of` field |
   | pr_approver | a new flag or role table (not in Nucleus today) |
   | finance | `has_finance_access` / `expense_is_finance`, with the two switches (`can_approve_vendors`, `can_approve_pos`) stored per employee |
   | finance_admin | `is_finance_admin` |
   | admin | `erp_role` `admin` or `super_admin` (logs and people editing: super admin only) |
   | observer | a new flag |

   Reporting Manager level: Nucleus has `employees.manager_id`, so the first approval level can be the person's **real manager** instead of "any approver-type role". That is an improvement, and a deliberate behaviour change; decide it explicitly.
4. **Existing Nucleus Finance module.** Keep it separate, or merge its dashboards with this tool's Finance views?
5. **Who may use it at launch.** Expenses is gated to super admin plus its manager. Opening it to all staff is a one-line change in `access.ts`, but only after the permission checks below pass.

## 4. Check the live Nucleus database first (one query, read only)

Nucleus's repo contains a migration (`20260705185851_...`) that drops its old expense tables and creates early, smaller versions of some of this tool's tables, but the generated `types.ts` does not list them, so the repo cannot say whether they exist in the live database. Run this in the Nucleus Supabase SQL editor and send the result:

```sql
select c.relname as table_name, c.reltuples::bigint as approx_rows
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('expense_captures','expense_details','expense_reports','expense_notifications','report_approvals','report_expenses',
                    'purchase_requests','purchase_orders','pr_approvals','vendors','advances','team_members','tds_rules','system_logs',
                    'activity_log','approval_rules','custom_categories','feedback','zoho_directory','system_state','report_advances',
                    'expense_vouch_events','approval_delegations','pr_review_presence','vendor_invites','vendor_bank_change_log','audit_trail_access_log')
order by 1;
```

- **No rows returned:** no clashes. Load the tool's tables with their original names (section 5).
- **Rows returned, all empty** (the expected case, since the module was never migrated): drop those stubs in a Nucleus migration, with the Nucleus owner's approval, then load. Confirm each is empty with `select count(*)` first; `reltuples` is only an estimate.
- **Rows returned with data:** stop and tell the owner. Something is using those tables; do not drop them. Use a different table prefix or schema for this module instead.

## 5. Loading the tables and data into Nucleus's Supabase (built and tested)

Do **not** use `apply-db.cjs` or `docs/database/schema.sql` for Nucleus: the original schema lets everyone read everything without signing in and would log all of Nucleus's own schema changes. Use these instead:

| File | What it is |
|---|---|
| `docs/database/nucleus_schema.sql` | The same 27 tables, columns, 11 functions, triggers and 5 private buckets, made safe for Nucleus (generated by `npm run migration:nucleus-schema`) |
| `scripts/migration/apply-nucleus.cjs` | Loads the schema, then the data, then the counters, then checks every row count |
| `scripts/migration/verify-nucleus-schema.mjs` | Proves all of the above against a scratch Postgres shaped like Nucleus (`npm run migration:nucleus-verify`) |

**What the Nucleus version changes, and why**

- **Stops if anything clashes.** If a table or function with one of the tool's names already exists, it aborts and changes nothing (the original would have skipped or overwritten silently). It also refuses a database with no `employees` table or without the columns `email`, `is_active`, `erp_role`.
- **Sign-in only.** The "open to everyone" policies are replaced. Only a signed-in Nucleus employee who is **active** in `employees` can read or write the tool's tables and its storage buckets. People who are signed in but not employees, inactive employees and anyone not signed in get nothing. The `anon` role has no access to any table.
- **Logs are admin-read.** Only `admin` and `super_admin` can read the System Log and the audit-access log. Nobody, including the database owner, can edit or delete System Log rows (the original triggers are kept).
- **No table-level extras.** Signed-in users cannot truncate tables or create triggers.
- **No schema-change event triggers.** They are left out on purpose; they would record every Nucleus migration.
- **Still to do, after the role mapping is agreed:** role-based rules inside the database (for example who may approve a PO). Today those stay in the application, as they do in the original. Until then every active employee can read the tool's tables, including vendor bank details, if they query the API directly. If that is not acceptable at launch, tighten the policies first (the generator is the place to do it).

**Steps**

1. `npm install`, then `npm run migration:nucleus-verify`. Every line should say `ok`.
2. Unzip the DATA_PRIVATE package into `db_export_backup/migration_pack/`.
3. Run the section 4 query and drop any empty clashing tables (with the Nucleus owner's approval).
4. Dry run (changes nothing, lists any clash). `CONFIRM_PROJECT_REF` must be the project ref inside the connection string:
   ```bash
   TARGET_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" CONFIRM_PROJECT_REF=<ref> node scripts/migration/apply-nucleus.cjs --dry-run
   ```
5. Apply. Either do it all in one go (same command without `--dry-run`), **or, recommended so the change is recorded in Nucleus**: put `nucleus_schema.sql` into Nucleus's `supabase/migrations/` as a new migration and let Lovable/Supabase apply it, then load only the data with `--data-only`.
6. Upload the stored files: `TARGET_SUPABASE_URL=https://<ref>.supabase.co TARGET_SERVICE_ROLE_KEY=<key> node scripts/migration/upload-storage.cjs`.
7. Check: every table's row count matches (the script prints it), the next PR number continues the old sequence, and an old report, PO and vendor open with their attachments.

**What was and was not tested.** The scratch Postgres test proves the schema applies on a Nucleus-shaped database, that all 27 tables load row for row, that the access rules and the log lock behave as described, that document numbering continues, and that a clash or a missing `employees` table stops the migration with no changes. It is a stand-in, not Nucleus: it does not exercise the real Supabase API layer, Google sign-in tokens, or Nucleus's real `employees` data. Run the dry run and a test sign-in as a real employee, a non-employee and an admin before staff use it.

## 6. Build order inside Nucleus (one Lovable prompt per step; test each)

Start each prompt with: *"This module is a port of an existing tool. Use the specification in `docs/` and the code in `src/lib/` of the repository linked. Do not add features or change policy numbers. The database tables already exist; do not recreate or rename them. Use Nucleus's existing components, routes and `NAV`."*

1. Access: map roles (section 3), `canSeeModule` for the new screens, and row-level security.
2. Ported logic files in TypeScript, with `parity_vectors.json` passing.
3. Expense capture and OCR (edge function using the prompts in `AI_PROMPTS.md` verbatim; retire `ocr-receipt` or make it call the same code).
4. Reports and approvals, then Finance (vouching, TDS, reimbursement, Tally).
5. PR, PO, vendors (built natively; delete the leftover intake forms, `intake-proxy` and `intake_submissions` from section 1 once this lands).
6. Advances, delegation, logs, maintenance, notifications. Reuse Nucleus's notification and audit tables where the shape matches; otherwise keep the tool's.
7. Email, Slack and reminders as edge functions; secrets in Supabase, never in a chat.

Because Lovable and other people commit to `main` at the same time, work on a branch, merge in small steps, and never let Lovable regenerate migrations that touch the tool's tables.

## 7. Cutover

There is no live link between the systems, so the move is a **one-time copy**:

1. Keep the current tool **fully live and untouched** while the Nucleus module is built and tested against a **copy** of the data (a snapshot from `npm run handover`).
2. Pass `PARITY_CHECKLIST.md` with test users for every role.
3. Freeze the old tool (maintenance mode). Rebuild the packages (`npm run handover -- --with-storage`) so the data is final. **Clear the test data** out of Nucleus, load the final data, run the smoke test.
4. Open the Expenses module to staff and tell people the new address. Nothing syncs back: anything entered in the old tool after the freeze is lost, so the freeze must be firm.
5. Keep the old tool in maintenance mode, read-only, for at least two weeks, then retire its deployment and its Supabase project. Remove the leftovers from section 1.

## 8. Things only a person can do (not possible from the repo or from Lovable)

- Run the section 4 query and confirm any same-named leftover tables are empty before they are dropped.
- Approve any change to the live Nucleus database; apply the load (SQL editor or a machine with Node and the connection string).
- Create the Supabase secrets the module needs: `GROQ_API_KEY` (new: Nucleus has none today), `CRON_SECRET`, and `GEMINI_API_KEY` (Nucleus already has it). `RESEND_*` is not needed. Add the daily cron.
- Confirm what "Nucleus mail" is and how a module calls it (see the decisions log: no sending code was found in the Nucleus repo).
- Confirm the role mapping with Finance and HR, and who is allowed to see bank, PAN and Aadhaar data.
- Upload the stored files (needs the service-role key).

## 9. Decisions log (answers to the Nucleus builder's ten questions, 18 Nov 2026)

Checked against the Nucleus repo and the tool's data on that date. "Settled" means the owner has agreed; "Recommended" needs the owner's yes.

| # | Question | Answer |
|---|---|---|
| 1 | Who ports the logic files? | **Done (18 Nov 2026), on a branch, awaiting review.** Ported with a generator, not by hand, so it can be proven and repeated: branch `feature/expenses-logic` of the Nucleus repo, folder `src/modules/expenses/lib/` (72 logic files, `.ts`, logic unchanged). All 50 parity cases and the integrity check pass; the folder type-checks and lints clean in Nucleus. See section 11. Lovable now builds only the screens. |
| 2 | Where do roles live? | **Settled in principle: keep the tool's own `team_members` table as the role table for this module**, linked to Nucleus users by email (the schema already loads it, 474 rows). Do not add columns to Nucleus `employees`. The sign-in-only policies use `employees` only to confirm the person is an active Nucleus employee. |
| 3 | Role mapping | `team_members` already holds every person's tool role, so there is little to map. The real work is a **check**: people in `team_members` who are not in Nucleus `employees` (old Zoho accounts, the second `thedelta.org.in` address) cannot sign in. Run the query in section 10 after the load and decide who to add, link or ignore. Confirm the finance, PR approver and Finance Admin names with Finance. |
| 4 | Reporting Manager level | **Copy the current behaviour exactly** (any approver-type role may act). Switching to `employees.manager_id` is an improvement for after parity. |
| 5 | Known bugs | **Copy the tool as it is, then fix with Finance.** Stale entity names (`NLF FCRA`, `TNF US`): the FCRA notes never fire; decide the intended behaviour. **Retired COO rule: no action, it is already inactive** and could never be picked (the earlier note that it was active was wrong). Two TDS rules on category "Other": fix in Settings, TDS Rules by moving them to proper categories, with Finance. `expense-reports` bucket: do **not** create it at first (parity); decide afterwards whether report PDFs should be stored. |
| 6 | AI text calls | **Keep Groq for text with the same prompts**, so the tuned behaviour is unchanged (summaries, audit opinion, category hint, policy check; all advisory). Nucleus has **no Groq key today**, so one new secret `GROQ_API_KEY` is needed. OCR stays on Gemini, but use the tool's prompts and settings (`AI_PROMPTS.md`: temperature 0, JSON output, thinking off, 3 attempts), not Nucleus's simpler `ocr-receipt`. Model `qwen/qwen3.8-27b` could be retired by Groq one day: keep the model name in one place. |
| 7 | Email | **Settled: use Nucleus's own mail, not Resend.** Open point: **no email-sending code or mail secret exists in the Nucleus repo** (no function, no Resend/SMTP/Gmail key; its functions use only Supabase, Gemini, Slack and Keka secrets). Someone must say what Nucleus mail is (a platform feature, Supabase Auth SMTP, an external service) and give the module one function it can call with recipient, subject and body. The old tool's email templates (`api/send-email.js`) are the content to reuse. |
| 8 | Public vendor self-registration link | **Agreed: build last, with a security review.** The schema gives the signed-out role no access at all (correctly), so the public page must call a Supabase Edge Function that checks the invite token, limits use, and writes with the service role. The original page wrote straight to the database with the public key. |
| 9 | Existing Nucleus Finance module (MIS) | **Settled: keep it separate and untouched.** |
| 10 | Cutover date | **Agree a firm freeze date with Finance.** Anything entered in the old tool after the freeze is lost. Before the freeze, Finance should clear the backlog of 906 approved reports never marked reimbursed (now possible from All Reports), so the carried-over data is clean. |

**Two risks the builder raised, and where they stand**

- **Name clashes.** Checked: none of the tool's 27 table names appear in Nucleus's generated live types. Ten appear in an old Nucleus migration (5 July 2026) that the live types do not show, so they are probably gone. The generic names (`feedback`, `activity_log`, `system_state`, `system_logs`) have no trace in Nucleus; its own feedback table is `product_feedback` and its other logs are `audit_logs` and `okr_activity_log`. The migration also checks **functions** (not only tables) and **aborts without changing anything** on any clash, so a same-named Nucleus function can never be silently overwritten. The live check query is still the proof.
- **Event triggers.** Already handled: `nucleus_schema.sql` does not install them; only the append-only lock on `system_logs` is kept.
- **Sensitive data in production.** Agreed: build and test on the empty schema plus a few test rows; load the real data only at cutover, after the access rules are verified for each role. Today's baseline lets every active employee read the tool's tables through the API (hiding the menu does not protect data). **Role-based database rules must be in place before the real data is loaded** (section 5, "Still to do").

## 10. How to proceed

1. **Owner:** reply to the builder with the answers above; run the section 4 check query on Nucleus; find out what "Nucleus mail" is.
2. **Port the logic (Claude Code, on a Nucleus branch such as `feature/expenses-logic`):** copy the rule files from `src/lib/` of this repo into a new Nucleus folder (for example `src/modules/expenses/lib/`), convert to TypeScript, swap the Supabase client import for Nucleus's (`@/integrations/supabase/client`), keep every function and constant unchanged. Add a test script that runs `docs/data/parity_vectors.json` and make all 50 pass. Note the 50 cases cover only the pure rules (policy limits, approval route, advance notice, GSTIN, TDS); the files that read and write the database are proven by `PARITY_CHECKLIST.md`. Merge to `main` through a pull request.
3. **Create the empty tables:** apply `docs/database/nucleus_schema.sql` as a Nucleus migration (after the clash check), plus a few test rows; do not load real data yet.
4. **Lovable builds the screens**, one module at a time (section 6), with the standing instruction: use the existing tables and the ported logic files, never edit or recreate them.
5. **Role-based database rules**, tested per role with the same scratch-Postgres harness (`verify-nucleus-schema.mjs` is the base). Vendor bank details, PAN and Aadhaar need special care because row rules cannot hide single columns.
6. **Public vendor link** and **email**, last.
7. **Cutover:** freeze date, final export, load the real data with `apply-nucleus.cjs --data-only`, upload files, run the parity checklist, open the module.

**After the load, find people who cannot sign in** (in the tool's `team_members` but not an active Nucleus employee):

```sql
select tm.email, tm.name, tm.role
from public.team_members tm
left join public.employees e on lower(e.email) = lower(tm.email) and coalesce(e.is_active, true)
where e.id is null and tm.role <> 'employee'
order by tm.role, tm.email;
```

Any approver, finance or admin person listed here would be locked out of their approvals. Plain employees who are missing are usually old or test accounts.

## 11. The logic port (done, 18 Nov 2026)

**Where:** Nucleus repository, branch `feature/expenses-logic` (cut from `origin/main` at the time), folder `src/modules/expenses/lib/`. It is in a separate git worktree, so nothing in anyone's normal Nucleus working copy was touched. Pushed to the Nucleus remote as a branch for review; it reaches `main` only through a pull request.

**How:** `node scripts/migration/port-to-nucleus.mjs --nucleus <path to the Nucleus checkout>` in this repository. It copies each `src/lib/*.js` as a `.ts` file with only mechanical changes, and **compares every file with its original line by line, stopping if any other line differs**:

1. a header (`eslint-disable`, `@ts-nocheck`, where the file came from);
2. relative imports get an explicit `.ts` extension (Nucleus's convention);
3. `await fetch('/api/...` becomes `await apiFetch('/api/...` (`seams.ts` sends it to a Nucleus Edge Function), plus one import line;
4. `auth.ts` only: the type-an-email sign-in is replaced by a lookup of the signed-in Nucleus user in `team_members`; all permission helpers are unchanged.

Not ported: `supabase.js` (replaced by `supabase.ts`, which re-exports Nucleus's shared client, so the user's session and the database access rules apply) and `src/lib/i18n` (UI).

**Proof**

- `node --test src/modules/expenses/lib/parity.test.mjs` (also `npm run test:expenses-logic`): 51 tests pass: the 50 cases in `docs/data/parity_vectors.json` plus a **port integrity** check that fails if any ported file is edited later (so Lovable or anyone cannot silently change a rule).
- Sabotage test: changing the food limit from 750 to 800 made the integrity check and the two food cases fail; restoring the file made all 51 pass again.
- `tsc --noEmit` on the Nucleus project: 0 errors in the new folder. ESLint with Nucleus's own rules: clean.
- Re-running the generator without `--force` succeeds and changes nothing; it refuses to overwrite a file that was edited in Nucleus.

**What the 50 cases do and do not cover.** They cover the pure rules: policy limits, approval route by total, advance notice, GSTIN check digit and TDS. The files that read and write the database (approvals, vouching, reimbursement, numbering, notifications) are not covered by them; those are proven by `PARITY_CHECKLIST.md` once screens exist.

**Honest limits of this step**

- The files are `.ts` but carry `@ts-nocheck`: that is what keeps the logic byte-for-byte. Real types can be added later in a separate, reviewed change with the parity test as the safety net.
- **Three Edge Functions do not exist yet:** `send-email`, `notify-slack`, `ai-proxy`. Until they do, OCR and AI hints fail quietly (the user types instead) and no email or Slack message is sent, which is the same best-effort behaviour as the old tool. The mail service is still undecided (see decisions log, #7). `ai-proxy` should reuse the original `callGeminiDirect` / `callGroqDirect` code (it is in `gemini.ts` and `groq.ts`) with the real keys as Supabase secrets, and must require a signed-in user.
- Nucleus lacks `jszip` and `pdf-lib`, needed only when a screen imports the PDF and export files (`pdfMerge`, `pdfGenerator`, `poBundle`, `auditPack`, `auditTrail`, `vendorProfilePdf`, `expenseAttachmentsPdf`). `jspdf`, `html2canvas`, `pdfjs-dist` and `react` are present.
- `slack.ts` `recordUrl()` builds a link for the old single-page app; Nucleus routes need their own link format.
- Unrelated to this port: `intake-proxy` and its table still exist in Nucleus and should be removed when the module ships.

**Next, in order**

1. Review the branch. In the Nucleus repository: `git diff origin/main --stat` and read `src/modules/expenses/lib/README.md`. Commit it, push it, open a pull request, merge. Because Lovable also commits to `main`, merge promptly and keep the branch short-lived.
2. Create the three Edge Functions (`ai-proxy` first; `send-email` once the mail path is known).
3. Apply `docs/database/nucleus_schema.sql` as a Nucleus migration (empty), with a few test rows.
4. Give Lovable this standing instruction for every screen prompt: *"Use the existing tables. Import all rules from `@/modules/expenses/lib/...`. Never edit, move or reimplement anything in `src/modules/expenses/lib`. If a rule seems wrong, say so instead of changing it."* Then build screens one module at a time (section 6).
5. Add role-based database rules and test them per role before any real data is loaded (section 5, "Still to do").
