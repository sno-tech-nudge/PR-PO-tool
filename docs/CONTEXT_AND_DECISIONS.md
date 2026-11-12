# Context and decisions

Why the tool exists, how it grew, what was decided and why, what went wrong, and what is still open. Written so a person or an AI picking this up cold has the reasoning, not just the result.

## 1. Who and why

**The Nudge Institute** (with its sister brands *the^delta* and *the*spark*) runs programmes funded by several donors, through legal entities that include an FCRA-registered one (foreign contributions have extra reporting duties).
About 470 people have accounts. Spending has to be attributable: **entity, programme, sub-programme, donor**, and approved by the right people before money moves, then accounted for in Tally.

This tool replaced an earlier process built on **Zoho** (Creator forms and a Zoho user directory). Historical purchase orders, vendors and reports were **imported** into it; you will see that in the data:
`Zoho category: …` text in `sub_category`, the `zoho_directory` table (used for attendee pickers), "Zoho-parity" fields, attachments migrated from Zoho (some only as Drive links) and PO/VR/ER numbers that predate the app.

The tool is one app for four jobs: **employee expense claims and reimbursements**, **purchase requests and orders**, **vendor onboarding with KYC**, and **advances**, with an **audit and control** layer on top. The Finance team ("Accounts") are the heaviest users and shaped many features (vouching, TDS, assignment, Tally export).

It is **live**. At 2 Nov 2026 it held about 940 reports, 2,100 expenses, 1,050 PRs, 1,040 POs, 640 vendors. It was developed in small increments, with Finance as the main source of requirements, and **directly against the production database** (there was never a staging environment).

## 2. How it grew (from the commit history, 4 Aug to 5 Nov 2026)

| When | What landed |
|---|---|
| Aug 4-11 | Initial tool (expenses, PR/PO/ER workflow, Finance dashboard); moved to a new Supabase project (5 Aug); PR form UX; Quick Add; AI model fixed |
| Aug 17-19 | Zoho-parity expense fields and report workspace; **vendor management** (Aadhaar KYC, PAN duplicates, cheque OCR, document requirements per entity type, profile PDF); notification inbox; admin-managed team roles |
| Aug 24-26 | PR form reworked (quantity/rate, credit terms, real 3-step approval routing); approval chain enforced for admin too; PO PDF redesigned to the org template; donor mapping from the finance sheet; **Slack**, deep links, "someone is already reviewing"; daily reminder cron; OCR reliability fixed at the root (Gemini "thinking") |
| Aug 31-Sep 3 | Multi-line-item PRs with per-line categories; PO export bundle; audit trail; Finance Analytics; PO-tranche reports; **COO role** added; atomic document numbering; multi-user testing prep |
| Sep 5-15 | PO terms per entity; status emails for PR, vendor, report; batch OCR upload; **re-skin to the Nudge design system**; configurable report approval rules |
| Sep 20-29 | **Vendor self-registration link**; PAN/GST/MSME auto-fill and mismatch warnings; **Nucleus intake API** (later excluded); keys moved server-side; email routes merged; PO status timeline; voice input; responsive shell |
| Sep 30-Oct 7 | **Advances**; per-function Functional-Leader routing; linked thenudge/thedelta accounts; first-time-filer tours, delegation, activity log, violations dashboard, Hindi toggle; company-card expenses never reimbursable; collapsible sidebar |
| Oct 12-15 | Report route simplified (Reporting Manager, Functional Lead above ₹2,00,000, Finance); **line-by-line vouching** with duplicate and split-bill checks; Accounts requirements (vendor vs reimbursement, deductions, automatic TDS, assignment, advance balances) |
| Oct 26-Nov 1 | Late-expense warning after 30 days (was 7); **System Logs (append-only)**; Logs and Approvals & History tabs; audit pack; custom approval; scheduled maintenance |
| Nov 2-5 | README and **migration pack**; three new categories; **TDS per line item**; "Other must say what it is"; **auto-created categories**; new donor mapping with location; **Finance Admin** role; Finance tour; **per-person PO approval switch**; light-green fully-invoiced rows; department filter; **mark reimbursed from All Reports** (fixing a save that never worked) |

## 3. Decisions and the reasons (do not re-litigate)

The decision is what the owner chose; the reason is recorded where the owner or the code states it, and otherwise marked as the design's effect.

| Decision | Why |
|---|---|
| **The tool is rebuilt natively inside the Nucleus ERP (Lovable, TanStack Start, Supabase), with all data only in Nucleus's Supabase project, and the two systems are not connected** (12 Nov 2026). Nucleus is treated as if it never had a PR, PO or vendor module; its leftover intake code is removed | One ERP, one login, one database; no relay or sync to maintain. See `BUILD_INTO_NUCLEUS.md` |
| Rebuild as an **exact replica first**, improve afterwards | The owner needs continuity for ~470 people; parity is provable, "improvements" are not. All later changes should be additive |
| **Supabase** (new project) is the database and file store; API routes and the daily job move with the code | Owner's stated preference |
| **Leave out the Nucleus intake proxy** (2 Nov 2026) | The integration with another internal system is not being carried over |
| Keep `INTEGRATION_BRIEF.md` but mark it historical | It describes an earlier plan and an older stack |
| **Email-only sign-in** (no password) | Part of the original design (the reason was not recorded). Known weak; carried over unchanged for the replica; to be replaced in a rebuild |
| Roles are **text with no database constraint**, plus two per-person switches on Finance (vendors, POs) | Fact of the design: a new role needs no schema change, only code. Switches limit who among Finance may approve vendors or POs |
| **Finance Admin**: an admin's power over Finance and Settings, but no logs and no adding/editing people; may approve anything except its own requests | Finance leadership needs full approval authority without seeing logs or managing staff |
| **PO approval is a per-person switch**, like vendor approval | Limit who can issue POs without a new role |
| **TDS only on line items**, never on GST or incidentals; rules are data (Settings), not code | That is how Finance computes it; the rules change and Finance owns them |
| **"Other" must say what it is**; a text appearing 5 times under Other becomes a category automatically | Reports by category were useless with an unexplained "Other"; threshold editable in `system_state` |
| **Pending ₹0 = nothing left to pay out**; green rows and a tick in All Reports to mark reimbursed | Finance wanted a quick way to close paid reports |
| Entity/programme/sub-programme/donor mapping from Finance's sheet; **location shown to approvers only**, small and blue, not a form field | Location comes from the sheet, not from the requester |
| **Append-only System Log** enforced in the database (triggers refuse update, delete, truncate), plus DDL event triggers | Audit evidence that cannot be quietly edited, even through SQL |
| **OCR is advisory and never blocks** | A bad photo must not stop someone claiming; people fix what the model misreads |
| **Gemini for vision, Groq for text**; AI keys server-side behind one proxy | Groq had no vision model on the account; keys must not ship in browser code |
| **Temperature 0, thinking off** for OCR | Reliability: thinking consumed the output budget and returned nothing |
| Documents and data are **private**; shared only through signed URLs | They hold bank details, PAN and Aadhaar |
| Approval levels belong to roles; **not even admin acts out of turn** (except Finance Admin and delegates) | Segregation of duties |
| **FL routing per function** to one named person; `super_fl` overrides | Each function has a specific Functional Leader |
| Reports count against advance balances **as soon as submitted** | Prevents double use while approval is pending |
| Hindi is a **runtime text swap**, not translated components | Added in one step without touching every screen; unreviewed |
| The migration pack is **regenerated from the live database**, never hand-maintained | Cannot go stale; verified by replaying it into an in-memory Postgres |

## 4. Working agreements (how the owner and developer worked)

- Build and **verify on local dev**, never test by signing into production as a real employee (verify role behaviour with a stubbed lookup instead).
- `npm run lint` must show **0 errors** before anything ships.
- **Only push when told** ("push it live"). Commit the **exact files** that changed, never `git add -A` (the working tree can hold large local files). Then wait until the Vercel deployment is **Ready** and say so.
- **Database changes** go straight to the live database (there is no runner): write the SQL as `supabase_migration_<topic>.sql` for the record, apply with a short one-off script, delete the script, then refresh the migration pack.
- **Additive over rewriting.** New behaviour is added beside the old; existing numbers, labels and flows are not changed unasked.
- **Keep the migration pack and docs current** whenever an API route, cron, env var, bucket, role or rule changes (`npm run migration:check`, `npm run handover`).
- Plain, short UI copy; brand brown, Montserrat and Lato.

## 5. Bugs and surprises worth knowing

| Issue | Cause | Lesson |
|---|---|---|
| OCR failing most of the time (26 Aug) | Gemini "thinking" ate the token budget, returning empty text that looked like a network error | Turn thinking off, force JSON, retry, time-box |
| Slack never sent (26 Aug) | Browsers cannot call Slack webhooks (no CORS), the error was swallowed | Route through a server function; do not swallow errors silently without a test |
| Duplicate `report_approvals` rows (2 Sep) | Double-invoked submit effect | Unique constraint added; guard effects |
| "Mark as reimbursed" never saved (found 5 Nov) | The code wrote a column (`processing_date`) that does not exist, so it always failed, and nobody noticed | **Test write paths**, not only screens |
| TDS never charged when a rule had no limits | Code treated "no limit" as "below the limit" | Fixed 2 Nov; lines confirmed earlier keep what was saved |
| "machinery and plants" duplicated a built-in category | Category matching did not ignore "and" | `category_key` ignores "and" |
| Report PDFs not stored | Code uploads to an `expense-reports` bucket that was never created; failure is silent | Create the bucket or stop uploading; decide at migration |
| FCRA and TNF policy notes never fire | Policy code compares against stale entity names (`NLF FCRA`, `TNF US`) | Compare against the real names; add a test for each rule |
| An unrelated `pg` dependency lost on a no-save install | Migration tools relied on a package that was not declared | Declared (`pg`, `@electric-sql/pglite` as dev dependencies) |

## 6. Open items and known debt

1. **Resend domain** unresolved (another Resend team owns `thenudge.org`): find the owning team, or verify a subdomain; then set the key and `RESEND_FROM_EMAIL` and send a test.
2. **FCRA/TNF entity checks** do not match current entity names (above). Decide the intended behaviour with Finance.
3. `approval_rules` row 3 "Retired: COO level" is still active and overlaps the over-₹2,00,000 rule. Confirm which the router picks, then switch it off.
4. **TDS rules** for Prize (194BB) and rent on plant (194I) sit on category "Other" (first wins, so Other is taxed as a prize); rent (194I(2)) on "Lodging and Boarding"; there is no "Rent" category. Move them in Settings, TDS Rules.
5. **Tally ledger names** for the three new categories are developer guesses (Plant and Machinery, Prize and Challenge Expenses, Recruitment Expenses); `TODO(finance)` comments mark the others. Confirm with Finance's chart of accounts.
6. **Hindi** is unreviewed by a native speaker.
7. **Finance Admin gets no notifications** and, during maintenance mode, is treated as an ordinary user.
8. **906 approved reports** have never been marked reimbursed (the save was broken until 5 Nov). Finance needs to clear this backlog, now possible from All Reports.
9. The "Pending ₹0" filter has nothing to show yet from real data: no vendor report or advance-covered report has a ₹0 payout so far.
10. **FCRA SAY "Unrestricted" donor** has seven locations, so no location is shown for it.
11. The **TNF** entity is not in Finance's sheet but is kept for existing records.
12. **Security** (see `START_HERE.md`): open policies, email-only login, unauthenticated API routes, no staging.
13. **Advance approval** has no role check beyond reaching the Approvals tab.
14. **No automated tests**; category, policy and prompt lists are duplicated across files (see `ARCHITECTURE.md`).
15. Entity **addresses** for the PO PDF are blank for three of the four entities (only the FCRA one is filled in `src/lib/orgEntities.js`).

## 7. Glossary

| Term | Meaning |
|---|---|
| **ER** | Expense Report (`TNIE…` reimbursement, `TNIV…` vendor payment) |
| **PR / PO** | Purchase Request / Purchase Order (`26/27-PR-07-0053`) |
| **VR** | Vendor Registration number |
| **FL / Super FL** | Functional Leader (approves for a function) / one who can act for any function |
| **Reporting Manager level** | A report approval level with no fixed role; any approver-type role may act |
| **Vouching** | Finance checking each expense line against its proof and marking it cleared, flagged or queried |
| **Accounts / Finance team** | Same people: role `finance` |
| **Pending (INR)** | What is still to be paid out on a report: net payable less advance applied |
| **Tranche** | An invoice paid against part of a PO |
| **Incidentals** | Extra charges on an invoice outside the line items (never taxed for TDS) |
| **TDS** | Tax deducted at source; sections such as 194C (contractor), 194J (professional fees), 194BB (prize), 194I (rent) |
| **PAN / GSTIN / MSME-Udyam / IFSC** | Tax id / GST registration number / small-enterprise registration / bank branch code |
| **Aadhaar–PAN link** | Whether an individual's Aadhaar is linked to their PAN; unlinked blocks vendor registration |
| **FCRA** | Foreign Contribution (Regulation) Act: foreign-funded money needs separate tracking and reporting |
| **NLF / AIC / TNF** | Entity short names: Nudge Lifeskills Foundation, AIC Developmental Foundation, TNF (legacy) |
| **Brand** | `The/Nudge`, `the^delta`, `the*spark`: shown on reports separately from the legal entity |
| **CAPEX / Revenue / Program expenditure** | The expense natures a PR can carry |
| **Nucleus** | Another internal system the excluded intake API was written for |
| **Zoho** | The earlier tooling this replaced; source of imported history |
| **Tally** | The accounting system Finance exports to |
| **Maintenance mode** | A switch that hides the app from everyone but admins |
| **Delegation** | An approver covering for another for a date range |
