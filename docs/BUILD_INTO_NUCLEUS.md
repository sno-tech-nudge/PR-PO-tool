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
| Leftovers to remove | Nucleus contains remnants of an earlier plan to forward vendor and PR submissions to the old tool: the screens Vendor Registration, Purchase Request and My Submissions (`src/components/expenses/`, route `src/routes/_app.expenses.tsx`), the edge function `intake-proxy`, the table `intake_submissions`, TypeScript copies of `donorData`, `prConstants` and `vendorGuards` in `src/lib/`, and (**CHECK**, section 4) possibly early stub versions of some of this tool's tables from migration `20260705185851`. **Delete or replace all of it** when the native module is built; none of it is kept, and nothing should be wired to the old tool |
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

## 5. Loading the data into Nucleus's Supabase

Do **not** point `apply-db.cjs` at the Nucleus database as it stands. It refuses a database that already has tables (good, that protects Nucleus), and the schema it would load contains things that are wrong for an ERP:

- **Open policies.** Every table in the export allows everyone (`USING (true)`), and `storage.objects` has an all-access policy for the tool's buckets. In Nucleus the browser key is public on the internet, so this would expose bank details, PAN and Aadhaar numbers to anyone, **without signing in**. Replace them with policies for `authenticated` users, driven by the role mapping above, **before any data is loaded**.
- **Event triggers.** `system_log_ddl` and `system_log_drop` log every schema change in the whole database, which would now include all of Nucleus's own Lovable migrations. Load them only if that is wanted, or restrict them to the tool's tables.
- **`team_members`.** Load it as a reference table to map people to the new role fields, not as a login.
- **Storage buckets.** Create the five buckets with **private** access and policies for signed-in staff only.

The practical route is a one-off, reviewed load: take `docs/database/schema.sql`, remove the policies, grants and event triggers, replace them with the authenticated, role-based versions, apply it through a Nucleus migration (so Lovable's `types.ts` regenerates), then load the rows and sequences from the private package (`02_data.sql`, `03_sequences_setval.sql`) and upload the files with `upload-storage.cjs`. Ask for a Nucleus-specific loader script once decisions 1 to 4 are made.

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
- Create the Supabase secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SLACK_WEBHOOK_URL`, `CRON_SECRET`) and the daily cron.
- Verify an email-sending domain in Resend (the original domain is tied up with another Resend team).
- Confirm the role mapping with Finance and HR, and who is allowed to see bank, PAN and Aadhaar data.
- Upload the stored files (needs the service-role key).
