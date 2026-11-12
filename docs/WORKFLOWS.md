# Workflows and state machines

Each record's life, what moves it, what is written, and who is told. Status names are the exact text stored in the database. Where a rule needs numbers see
`BUSINESS_RULES.md`; who may act is in `ROLES_AND_PERMISSIONS.md`.

Conventions: **Activity Log** = `activity_log` (what people did, admin-visible). **System Log** = `system_logs` (append-only, schema and operational events).
**In-app notice** = a row in `expense_notifications` (the bell). **Email** = `/api/send-email` (Resend). **Slack** = `/api/notify-slack` (one webhook, PR/PO/vendor events only).

---

## 1. Expense (one receipt or bill)

```
capture ─► saved ─► reported (inside a report) ─► (report rejected) ─► saved again
```

1. **Capture** (camera, file, quick-add, bulk-add, or offline queue). Image is shrunk, uploaded to `expense-documents`; OCR pre-fills (`AI_AND_OCR.md`). Hash saved for duplicate detection.
2. **Details**: amount, vendor, date, category (Other must be explained), purpose, who it was for (just me / my team with headcount), trip, payment method and proof, entity and donor allocation, optional itemisation, PO link where needed.
   For vendor invoices: GSTIN, invoice number, GST/incidentals split.
3. **Policy check** runs (hard checks, soft flags, one-tap reason). A violation without a reason keeps `policy_status = 'blocked'`; otherwise `policy_status = 'submitted'`.
4. Saved expenses sit in My Expenses (`status = 'saved'`). Drafts and saved expenses can be deleted by their owner.
5. Adding it to a report sets `status = 'reported'`. If the report is rejected the expense returns to `saved`.

Special type `purchase_order_tranche`: an invoice captured against an issued PO (payment kind `vendor`).

## 2. Expense report

```
draft ─► submitted ─► under_review ─► approved ─► processing* ─► reimbursed
              │             │
              └─────────────┴──► rejected ─► (owner reopens) ─► draft
```
`processing` is a valid, displayed status but the current screens move `approved` straight to `reimbursed`.

**Create**: employee picks saved expenses (NewReportModal / Workspace), sees the route preview, may be asked about advance deduction (`AdvanceDeductionPrompt`) and headcount.

**Submit** (`ReportPreview.jsx`):
1. Generate the PDF (jsPDF + html2canvas), merge attachments (`pdf-lib`).
2. Reference number `TNIE…` / `TNIV…`; `status = 'submitted'`; expenses become `reported`.
3. Route decided from the total (`approval_rules`); `report_approvals` rows created (first `pending`, rest `waiting`, each `due_at` = +48 h). Auto-approve/auto-reject rules settle it on the spot.
4. Advances applied oldest first into `report_advances`.
5. Notify the first approver (in-app and email), confirm to the employee.

**Approve a level** (`processApproval` in `src/lib/approvalEngine.js`):
- Not the last level → that row `approved`, next row `waiting` → `pending`, report `under_review`, notify the next approver. If the next level is Finance, the report is **auto-assigned** to the Finance member with the fewest open reports.
- Last level → report `approved` (`approved_at`), employee emailed and notified.
- Optional notes are combined into the record; the trail shows "on behalf of" when a delegate acted.

**Reject a level**: reason required; report `rejected`, expenses back to `saved`, employee emailed with the reason (`RejectionBanner`, `RejectionModal`). The owner can reopen it (back to `draft`) and resubmit; resubmission is logged as `resubmitted`.

**Finance step** (the report is `under_review` with a pending Finance level): vouch each line, ask the employee questions, deduct amounts with reasons, set payment kind, set TDS on vendor lines, run the AI audit (optional), then approve.
Vouch events (`expense_vouch_events`, kinds `clear`, `reopen`, `query`, `reply`) record each step. A line waiting on the employee blocks approval. A rejected deduction or query notifies the employee, who answers in the report.

**Pay out and close**: from Pending Payments or All Reports, Finance selects approved reports and marks them reimbursed (`ReimburseModal`, `src/lib/reimburse.js`): only reports still `approved` change, `status = 'reimbursed'`,
`reimbursed_at` set, each logged in the Activity Log, employee emailed unless Finance unticks it. Tally export is a separate, repeatable step.

**Delete**: an owner can delete a report that is still a draft (logged `draft_deleted`). Only the draft goes: its expenses are released back to My Expenses with their receipts, and any PR link to it is cleared. A submitted report cannot be deleted by its owner.

## 3. Purchase request (PR) and purchase order (PO)

```
PR:  draft ─► submitted ─► approved ─► po_generated        (rejected at any approval level)
PO:  pending_approval ─► issued ─► completed                (rejected from pending, cancelled from issued)
```

**Raise** (`PRForm.jsx`): steps for vendor, items and categories, quotes, payment terms, donor allocation, notes, review. A draft can be saved and finished later (a reminder is sent after 24 h).
**Submit**: `PR` number from `next_doc_number('PR', fy)`, `status = 'submitted'`, two `pr_approvals` rows (level 1 Functional Leader pinned to the requester's function's FL where known, level 2 PR Approver), an AI summary
(`generatePRSummary`), in-app and email notice to the level-1 approvers, Slack "New PR raised".

**Approve a level** (`src/lib/prApprovalActions.js`): level 1 approved → level 2 `pending`, notice to PR Approvers, Slack "now awaiting …". Level 2 approved → PR `approved`, requester told, Slack "fully approved",
and a **PO row** is created automatically (`pending_approval`, number `PO` from the counter, amount = the PR amount or the part being ordered), notice to Finance members with the PO switch, Slack "PO created … awaiting Finance approval".
**Reject**: reason required, PR `rejected`, requester emailed. The requester can edit and resubmit (`rejected` PRs are reminded daily).

**PO approval** (Finance with the PO switch, or Finance Admin): approve → `issued`, PDF generated and stored in `po-pdfs`, requester notified, Slack; reject → `rejected` with reason, requester notified.
PR then shows `po_generated`. A PR can have several POs while amount remains.
**After issue**: the requester or Finance captures invoices against the PO (becoming reports of kind `vendor`, see section 2). When nothing is left to pay, Finance marks the PO **completed**; Finance may **cancel** an issued PO.
**Edit after submit**: not allowed at later levels; rejected PRs are the route back.

## 4. Vendor

```
draft ─► pending ─► approved
               └──► rejected ─► (resubmit) ─► pending
```
1. **Register**: an employee fills the form, or sends an **invite link** (`vendor_invites`, token and expiry) so the vendor fills it themselves without a login. Documents upload to `vendor-documents` and are OCR-read.
2. **Submit**: duplicate warnings (PAN, name, account) shown, never blocking; vendor number from the counter; Finance and vendor-approvers notified (in-app, email, Slack "New vendor").
3. **Review**: an approver (`canApproveVendor`) opens the vendor, may flag KYC problems (an Aadhaar not linked to PAN sends a blocking KYC email), then approves or rejects with a reason. Result emailed to the submitter and, where relevant, the vendor.
4. **Use**: only `approved` vendors can be chosen on a PR.
5. **Bank change**: a request records old and new details in `vendor_bank_change_log` for approval; the vendor profile PDF can be exported.

## 5. Advance

```
pending_approval ─► approved ─► recorded
        ├──► rejected
        └──► auto_rejected   (raised less than 7 days ahead; decided on submission)
```
Request (≤ ₹20,000, expected-use date ≥ 7 days away) → approver decides (emails `submitted`, `approved`, `rejected`, `auto_rejected`, `recorded` go to the person) → Finance **records** the payout → the balance is drawn down by reports
(`report_advances`, oldest first, counting reports from the moment they are submitted) → the ledger shows each use. The advance list and ledger are visible to the owner; Finance sees everyone's.

## 6. Delegation

An approver creates a delegation (delegate, role, start, end). From the start date the delegate gets that role's action-needed notices and can act on those levels; it ends on the end date or when revoked (`revoked_at`). Created, revoked and used-on-behalf events are in the Activity Log.

## 7. Settings events (all logged)

Role and switch changes (`role_changed`, `member_updated`, `po_approval_switch…`), TDS rule add/change (`tds_rule_added`, `tds_rule_changed`), approval rule changes, category hide/show, maintenance changes. People changes also write the System Log.

## 8. Notifications

**In-app** (`expense_notifications`, polled by the bell): created by approvals, assignments, link suggestions (`link_suggestion`: "this expense may belong to that PO"), vouch questions and replies, reimbursement, reminders.
**Email** (`/api/send-email`, four handlers selected by the body field `entity`): `vendor`, `pr`, `report`, `advance`; subjects and body templates live in the handler; the report email has a five-step timeline
(Submitted, Under Review, Approved, Processing, Reimbursed). All send best-effort and never block the action.
**Slack** (`src/lib/slack.js`): new PR, PR level approved/fully approved, PR rejected, PO created, PO issued, PO rejected, new or resubmitted vendor, and the daily reminders. **Reports and advances do not post to Slack.**
Record links are `<origin>/?type=<pr|po|report|vendor>&id=<id>` and open that record.

## 9. Daily reminders (`api/reminders.js`, 03:30 UTC)

For each draft PR, submitted PR waiting on a level, and rejected PR older than 24 h and not reminded in the last 20 h: an in-app notice to the right people (including delegates and super FLs for the FL level) and a Slack line; then `last_reminder_at` is stamped.
If `CRON_SECRET` is set the route requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron adds it automatically). It uses the browser anon key to talk to the database.

## 10. Maintenance mode

Stored in `system_state` (`maintenance`: start, optional end, message). Admin can start now, schedule, or end it. While active everyone but `admin` sees the maintenance page; a countdown banner shows beforehand.

## 11. Logs and audit

- **Activity Log**: business events (status changes, level approvals, assignments, deletes, rule changes, vouch events, resubmissions); filterable and exportable; admin only.
- **System Log**: append-only, written by app code (team changes, deployments, downloads) and by database event triggers (every schema change); admin only; refuses update, delete and truncate.
- **Audit pack** (`AuditPack.jsx`) and the PO **Audit Trail** (`AuditTrail.jsx`): the whole chain of one PO (PO to PR to invoices to approvals) for an auditor; opening or downloading it is itself recorded in `audit_trail_access_log` (who, which PO, what action).
- **Per-record timelines** (StatusTimeline, PRStatusTimeline, ReportJourney) are built from the approval rows and activity entries.
