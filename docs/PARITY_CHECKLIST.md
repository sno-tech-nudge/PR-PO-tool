# Parity checklist

How to prove a rebuilt or migrated tool behaves like the original. Work top to bottom; tick each line only when you have seen the result, not when you believe the code does it.
There are no automated tests in the original, so this list **is** the test plan. Rule values are in `BUSINESS_RULES.md`; who may do what is in `ROLES_AND_PERMISSIONS.md`.

Use a copy of the data, never the live system. Use real-looking test people for each role (admin, finance admin, finance with both switches, finance with neither, FL, super FL, PR approver, employee, observer).

## A. Data

- [ ] Every table's row count equals `summary.json` (`node scripts/migration/verify-pack.mjs` does this for the SQL; check again in the real target).
- [ ] 27 tables, 11 functions, 6 triggers, 30 policies (28 public, 2 on `storage.objects`), 5 bucket rows exist.
- [ ] `system_logs`: `update`, `delete` and `truncate` are each refused; `insert` works; both event triggers (`system_log_ddl`, `system_log_drop`) exist; a new `create table` then `drop table` adds two log rows.
- [ ] `select next_doc_number('PR', '26/27')` returns a number **one higher** than the highest existing PR number that year; same for `PO` and `VR`; two calls at once never return the same number.
- [ ] Identity columns continue after the highest id (insert a row; no duplicate-key error).
- [ ] Storage: all 766 files present (compare with `storage_inventory.json`); open one receipt, one vendor PAN, one quote, one PO PDF **from the app** (signed URL works).
- [ ] An old report, an old PO and an old vendor each open with their attachments and approval history.
- [ ] `team_members` has the same people and roles; a login with each role works.
- [ ] `approval_rules` (2 active standard rules plus the retired third), `tds_rules` (6), `custom_categories`, `system_state` (`maintenance`, `category_auto` threshold 5) are present.

## B. Rule vectors (automated)

`docs/data/parity_vectors.json` holds 50 cases generated from the original code: policy limits at the boundary (hotel, food, per-km, late claim, large claim), approval route by total, advance notice,
GSTIN check digit, and TDS (single-bill limit, yearly limit with catch-up, no PAN, no-limit rule, payee type, per-line split). Feed each `input` to your implementation and compare with `expect`.

- [ ] All policy cases match (`passed`, `rule`).
- [ ] Both route cases at 2,00,000 and 2,00,001 match (boundary: the Functional Lead joins only **above** 2,00,000).
- [ ] Advance: 6 days ahead is rejected, 7 is accepted.
- [ ] GSTIN: valid, bad check character, unknown state, bad format, whitespace and lower case.
- [ ] TDS: every case, including the three split cases.

Regenerate the file from the original with `npm run migration:vectors`; it is also rebuilt by `npm run handover`.

## C. Flows, by role

### Employee: expense and report
- [ ] Take or upload a receipt; image shrinks (longest side 2000 px), uploads to `expense-documents`, OCR pre-fills amount, vendor, date, category, invoice number, GSTIN, payment mode.
- [ ] A blank or very dark photo gives a clear "could not read" message, never a block.
- [ ] A PDF receipt reads page 1.
- [ ] Hotel above the limit, food above the limit, a claim over 30 days old and one over ₹20,000 without donor mention each show the right violation; a one-tap reason is offered where the original offers one.
- [ ] Choosing category "Other" demands a description.
- [ ] Add expenses to a report; submit; route preview matches `approval_rules`; a reference `TNIE…` is created; expenses become `reported`.
- [ ] Reject the report as an approver: expenses return to `saved`; the owner can reopen and resubmit.
- [ ] Delete a draft report: expenses are released, not deleted.
- [ ] Same receipt image used twice (any user) is flagged; same invoice number and vendor flagged; split bill across a threshold flagged.
- [ ] Offline: turn the network off, capture a receipt, turn it on, it uploads.

### Approvers
- [ ] A level is actionable only by its role; admin cannot act on an FL level; Finance Admin can, except on their own report.
- [ ] A delegate with an active delegation can act and the trail says "on behalf of"; after the end date or revoke, cannot.
- [ ] PR level 1 is actionable only by the resolved FL for the requester's function; `super_fl` can act on any; a function with no resolvable FL falls back to any `fl`.
- [ ] After PR level 2 the PR is `approved` and a PO exists in `pending_approval`.
- [ ] A Finance member **without** the PO switch cannot approve a PO; with the switch can; Finance Admin can (not their own request); admin cannot.
- [ ] A Finance member without the vendor switch cannot approve a vendor.

### Finance
- [ ] Vouching: vouch, flag, ask a question, employee replies, reopen; a line waiting on the employee blocks approval; vendor line cannot be vouched with TDS undecided.
- [ ] Deduction with reason; the food and hotel excess suggestion; employee is notified; net payable updates.
- [ ] Vendor report: TDS per line item, GST and incidentals untaxed, split visible on screen, override keeps the original in the note.
- [ ] Auto-assignment picks the member with the fewest open reports, not the employee themself.
- [ ] Mark reimbursed (from Pending Payments and from All Reports): only `approved` reports change, each logged, email sent unless unticked, more-than-90-days warning appears.
- [ ] Pending (INR) column, "pending 0" filter and light-green rows behave as in the original.
- [ ] Tally export (XML and CSV) opens and totals match.
- [ ] AI audit check runs and saves `ai_vouch_*` on the report.

### PR, PO, vendor, advance
- [ ] PR under ₹25,000 is refused with the message to claim as an expense; 2 quotes for 25,000 to 2,00,000; 3 above 2,00,000 with a comparative statement; single-source needs justification; credit term required unless 100% advance; advance over 30% flagged; 100% needs FL acknowledgement and screenshot; over ₹25 lakh shows the contract notice; allocation must total 100%.
- [ ] Donor mapping drop-downs match the sheet in `docs/data/`; location shows (small, blue) to approvers and nowhere in the form.
- [ ] PO PDF has the right entity block and terms; stored in `po-pdfs`; "Mark as Completed" and "Cancel" work; pending balance equals PO amount less captured invoices.
- [ ] Vendor: each document type OCR fills fields with the green tag; invalid PAN/IFSC/PIN/mobile are refused; duplicates warn but do not block; Aadhaar not linked sends the blocking email; public invite link works without login and expires.
- [ ] Advance: over ₹20,000 refused; under 7 days notice auto-rejected with email; approve, record; balance falls as reports are submitted; a report can draw on two advances oldest first.

### Admin and control
- [ ] Only admin sees Logs (Activity and System); Finance Admin does not.
- [ ] Finance Admin sees only finance, PR approver, FL and super FL people in Team & Roles, read-only.
- [ ] Add, edit, remove a person; role change resets the two switches when leaving `finance`; each is in the System Log.
- [ ] Maintenance mode: scheduled and immediate; everyone but admin sees the page.
- [ ] Categories: typing the same new text under "Other" five times (expenses and submitted PR items) creates a category and notifies; vague words and 40+ character text never do.
- [ ] Hindi toggle swaps text and back; unknown text stays English.
- [ ] Tours show once per person per device.

## D. OCR regression pack

Collect at least one real example of each and keep the expected fields next to it. Run through your reader and compare field by field (amount, vendor, date, category, invoice number, GSTIN, payment mode, card last 4):

- [ ] a printed restaurant bill and a hotel folio (amount = **final payable**, not subtotal)
- [ ] a handwritten bill
- [ ] a UPI screenshot (GPay and PhonePe) and a bank/card SMS
- [ ] a crumpled or angled phone photo, a dark photo, a blank page
- [ ] a flight or train ticket; a cab invoice
- [ ] a cancelled cheque, a bank statement header
- [ ] a PAN card, a GST certificate, an Udyam certificate, a Certificate of Incorporation and a partnership deed
- [ ] a vendor quote with several line items; an invoice with a printed invoice number
- [ ] a PDF of each of the above

Acceptance: the same fields come back, invalid GSTINs are dropped, nothing blocks when the reader fails.

## E. Messaging and jobs

- [ ] Each email type (4 entities, their types) arrives with the right subject and timeline; From address is on a verified domain.
- [ ] Slack receives: new PR, level approved, fully approved, rejected, PO created, PO issued, PO rejected, new or resubmitted vendor. Reports and advances do not post.
- [ ] `/api/reminders` called with the secret reminds an overdue draft, a pending PR and a rejected PR once, and not again for about 20 hours; without the secret it answers 401 (if a secret is set).
- [ ] The bell shows new notifications within 15 seconds and marks them read.

## F. Non-functional

- [ ] Works on a phone-width screen for capture, report building and approvals.
- [ ] List screens page past 1,000 rows (the API limit): the largest list shows all records.
- [ ] A cold start of every API route succeeds on the new host.
- [ ] No secret appears in the browser bundle (search the built JS for the key prefixes).
- [ ] The server-only variables (AI, email, Slack, cron) are not readable from the browser.

## Sign-off

| Area | Tested by | Date | Result |
|---|---|---|---|
| Data (A) | | | |
| Vectors (B) | | | |
| Flows (C) | | | |
| OCR pack (D) | | | |
| Messaging and jobs (E) | | | |
| Non-functional (F) | | | |

Do not cut over until every box is ticked or an exception is written down and accepted by the owner.
