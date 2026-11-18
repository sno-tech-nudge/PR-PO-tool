# Business rules: the organisation-specific behaviour

Every number, limit and special case below is encoded in the code or the database. Where a rule lives in a table (changeable by an admin
without a release) that is said. Where it lives in code, the file is named. Nothing here is a suggestion: it is how the tool behaves today.

## 1. Basics

- **Currency** INR, shown with Indian digit grouping (`₹2,95,000`, locale `en-IN`).
- **Fiscal year** April to March. Document numbers carry it (`26/27`). Yearly TDS limits count within it (`fyStartYear` in `src/lib/tds.js`).
- **Legal entities** (the `entity` on expenses, PRs, POs): *Nudge Lifeskills Foundation*, *Nudge Lifeskills Foundation - FCRA*,
  *AIC Developmental Foundation*, and the older *TNF*, kept for existing records. (Policy checks still test the stale names `NLF FCRA` and `TNF US`, see section 2.) There is also a separate **brand** field (`The/Nudge`, `the^delta`, `the*spark`) on expenses and reports. Entity addresses for the PO PDF are in `src/lib/orgEntities.js`.
- **Two email domains**: `thenudge.org` and `thedelta.org.in`. People can have a login on each; `team_members.linked_email` ties the two so
  "is this my record" checks treat them as one person (`isOwnEmail`). The Team and Roles department filter works by domain.

## 2. Expense policy checks (`src/lib/policyEngine.js`)

Run on every expense before a report is submitted. **Hard checks** can block; **soft flags** only inform.

| Rule | Detail |
|---|---|
| Late claim | An expense dated more than **30 days** ago fails ("exceptions need FL and COO approval"). |
| Hotel | Category *Lodging and Boarding*: base (amount ÷ 1.18 ÷ people) above **₹4,000** per person per night in a metro city, **₹3,250** elsewhere. The bill is treated as **one night**: no night count is asked, so a multi-night bill must be split or explained. Metro is detected from the description or trip name: Ahmedabad, Bangalore/Bengaluru, Chennai, Delhi/New Delhi, Hyderabad, Mumbai. |
| Food | Category *Food*: more than **₹750 per person per day**. People = the headcount if the expense is a group one (`my_team` with more than 1 attendee), otherwise 1. |
| Boarding pass | *Travel Fare* whose description mentions a flight needs a boarding pass mentioned. |
| Large claim | Amount over **₹20,000** needs a donor or programme mention in the description (a keyword such as "funded by", "donor:", "programme", "foundation", or a donor name); without one it is a **blocking violation** for every entity. The code has a separate, stricter message for the FCRA entity, but it tests for the old literal `'NLF FCRA'`, which no entity is called any more, so that branch **never runs**. Behaviour today is the same for all entities. |
| Exclusions | "Home to office" or commute with no trip is not reimbursable. For donor/client expenses, travel or stay for external guests, donors or speakers cannot be claimed. |
| Per km | Own-vehicle claims: **₹15 per km** car, **₹5 per km** bike/two-wheeler/scooter; fails if the amount exceeds rate × km by more than **₹50**. |
| Non-reimbursable items | A keyword list (alcohol, tobacco, card late fees and penalties, seat or class upgrades, lounge, personal shopping, traffic violations, vehicle repair and maintenance) blocks; for amounts over ₹500 an AI check (Groq) also reads the vendor and description: *high* confidence blocks, *medium* only flags. |
| Late flight booking | Flag if the flight was booked less than **15 days** before travel. |
| Handwritten bill | Flag when the document was accepted despite a quality warning. |
| Duplicate in report | Flag: same vendor (loose match), amount within ₹10 and date within 7 days of another expense in the same report. |
| Near an approval threshold | Internal-only flag when an amount is within ₹2,000 below **₹50,000** or **₹2,00,000**. |
| Entity notes | Intended: FCRA expenses get a note "tracked separately and reported to the Ministry of Home Affairs"; "TNF US" gets an extra-documentation note. **Neither fires today**: the code compares against the literals `'NLF FCRA'` and `'TNF US'`, but the entities are now named `Nudge Lifeskills Foundation - FCRA` and `TNF`. A rebuild that wants the intended behaviour must match the real names (decide with Finance; an exact replica leaves it as is). |

When a hard check can be explained, the form shows a **one-tap reason** instead of a long form (`src/lib/policyPrompt.js`):
*shared by more than one person, client or donor needed it, no cheaper option, urgent or emergency, approved in advance*. The chosen reason is saved on
the expense (`policy_justification`) and shown to approvers and Finance.

**PR/PO needed on an expense claim**: an expense over **₹25,000** with no linked PO needs a reason (*emergency purchase, my manager approved it,
one-off*), except for these categories, which are employee spend rather than supplier purchases: Travel Fare, Bike Fare, Lodging and Boarding, Food,
Relocation Allowance, Medicine, Staff Welfare (`needsPoLink`). The form also suggests an open PO for the same vendor, or one within 5% of the amount.

## 3. Report approval routing (`src/lib/approvalEngine.js`, table `approval_rules`)

- The route is decided by the report's **total**, against active rules in `approval_rules` ordered by `sort_order`. A rule matches when
  `total > min_amount` (or no minimum) and `total <= max_amount` (or no maximum). First match wins.
- Live rules: **up to ₹2,00,000** → Reporting Manager, then Finance Team. **Above ₹2,00,000** → Reporting Manager, Functional Lead, Finance Team.
  A third rule named "Retired: COO level" exists but is inactive (`is_active = false` in the 12 Nov 2026 export) and, being third in sort order, could never win over the second even if switched on.
- A rule can instead be `auto_approve` or `auto_reject`, which settles the report on submission and emails the employee.
- With no matching rule the code falls back to the same two routes using `FL_THRESHOLD = 200000` (`src/lib/approvalThreshold.js`).
- Each level becomes a `report_approvals` row: the first is `pending`, the rest `waiting`, each with `due_at` 48 hours after submission and a
  `required_role` (null for "Reporting Manager", which any approver-type role may act on).
- Approving a level activates the next one; approving the last one sets the report `approved`. Rejecting at any level sets it `rejected`, stores the reason,
  and **returns the expenses to `saved`** so the employee can edit and resubmit.
- When the Finance level is reached the report is **auto-assigned** to the Finance team member with the fewest open reports (ties by name), never the employee themself.

## 4. Purchase requests (`src/components/pr/PRForm.jsx`, `src/lib/prApprovalActions.js`)

- A PR is for a purchase of **₹25,000 or more** (`PR_MIN`). Below that the form says to claim it as an expense instead.
- **Quotes**: ₹25,000 to ₹2,00,000 needs **2**; above ₹2,00,000 needs **3**, with one marked selected and a **comparative statement** attached.
  *Single source* replaces them: a written justification plus the one quotation attached.
- **Line items**: each has description, quantity, **category**, rate; the base is the sum; **tax (GST)** is mandatory; **incidentals** optional. Total = base + tax + incidentals.
  If a line's category is *Other*, its description is required.
- **Payment terms**: *advance %* and, unless it is 100%, a credit term (frequency and date) for the after-delivery part. An advance **over 30%** is flagged;
  **100%** needs the Functional Leader's email approval acknowledged and a screenshot attached.
- **Above ₹25 lakh** the form warns that a signed contract must be in place before delivery.
- **Donor allocation**: one or more rows of entity, programme, sub-programme, donor and a percentage; they must total exactly **100%**. The highest-percentage row fills the
  legacy single fields. Location is *not* a field (see section 12).
- Only an **approved vendor** can be chosen.
- **Approval chain** is fixed: level 1 **Functional Leader**, level 2 **PR Approver**. Level 1 is pinned to **one named person** resolved from the requester's
  *function* (`src/lib/functionRouting.js`, `FUNCTION_FL_EMAIL`); if a function has no resolvable person, any Functional Leader may act. `super_fl` can act on
  the FL level of any PR. After the last level the PR is `approved` and a **PO is created** in `pending_approval`.
- A requester cannot approve their own PR except through Finance Admin's any-level power, which excludes their own requests.

## 5. Purchase orders

- Created automatically from an approved PR (possibly several POs against one PR, each for part of the amount). Numbered `26/27-PO-07-NNNN`.
- Approved and **issued** by a Finance team member who has the **PO approval switch** (`team_members.can_approve_pos`), or a Finance Admin (not for their own request),
  or someone covering by delegation. Statuses: `pending_approval` → `issued` → `completed` or `cancelled`; `rejected` from pending.
- A PO has a generated **PDF** (entity address, vendor, items, terms from `src/lib/poTermsAndConditions.js`) stored in `po-pdfs`.
- **Pending balance** of a PO = its amount less the invoices already captured against it (`src/lib/poBalance.js`). Employees can attach an invoice
  against the pending balance; Finance can **Mark as Completed** or **Cancel** an issued PO. In the list, an issued PO with ₹0 pending is tinted light green.
- The advance part of a PO is shown to Finance with its TDS (`PoAdvanceTds`), split across the PR's line-item categories in proportion.

## 6. Advances (`src/lib/advanceValidation.js`, `src/lib/advanceBalance.js`)

- Maximum **₹20,000** per advance; must be raised at least **7 days** before the expected usage date, otherwise it is **auto-rejected** on submission and the person is emailed.
- Statuses: `pending_approval` → `approved` → `recorded` (Finance records the payout); or `rejected` / `auto_rejected`.
- A **balance** = advance minus what reports have drawn from it. Reports count against a balance **as soon as they are submitted** (statuses submitted, under_review, approved,
  processing, reimbursed), so the balance already allows for reports still awaiting approval.
- A report can draw on **several advances**, allocated **oldest first**, and an advance can be used by several reports (`report_advances`). Anything beyond what the advances cover is what is reimbursed in cash.
- When a report has an advance the employee is asked whether to deduct it (`advance_choice`, with an optional reason); a line can be paid *from an advance* (`payment_method = 'Advance Adjustment'`) and then must name the advance(s).
- **What goes out in cash** = `max(0, net_payable − advance_applied)` (`payoutAmount`). After Finance changes a line, `advance_applied` is recomputed.

## 7. Finance processing of a report

- **Payment kind**: `reimbursement` (an employee's own out-of-pocket) or `vendor` (paying an invoice, subject to TDS). Finance can flip it; the net follows. Report references are `TNIE<yy>####` for the first and `TNIV<yy>####` for the second.
- **Vouching** (`src/lib/vouch.js`, `VouchChecklist.jsx`): every expense is a line. Each line's status is its latest event: *Not vouched*, *Vouched*, *Flagged*, *Waiting on employee*, *Employee replied*. Finance ticks to vouch, flags, or asks the employee a question. A line waiting on the employee **blocks approval**. A vendor line cannot be vouched with its TDS undecided.
- **Deduction**: Finance can take an amount off a line with a reason (*over the policy limit, not enough proof, personal or not business, duplicate of another claim, other*). The food and hotel excess over the limit is **suggested** in one click. The employee is notified.
- **Net payable** of a line = amount − deduction − TDS (TDS only on vendor payments). A report's `net_payable` is the sum, stored on the report.
- **Reimbursed**: Finance marks approved reports reimbursed from Pending Payments or All Reports. Only reports still `approved` change; each is written to the Activity Log; the employee is emailed unless Finance unticks it; a warning shows for reports approved more than 90 days ago. "Pending ₹0" in All Reports = nothing left to pay out.
- **AI vouch check** is advisory and saved on the report (`ai_vouch_*`).
- **Assignment**: see section 3. Anyone in Finance can claim or reassign.

## 8. Duplicate, split-bill and tax checks (`src/lib/duplicateCheck.js`, `src/lib/taxChecks.js`)

Shown to Finance while vouching; **never blocking**.

- **Same receipt image**: SHA-256 of the stored image (`expense_captures.receipt_hash`) matches another expense, by anyone.
- **Same invoice**: same normalised invoice number and (same vendor or amount within ₹1).
- **Same bill**: same vendor, amount within ₹1, same day.
- **Split bill**: the same employee, same vendor, same day, 2 or more bills, whose total crosses **₹25,000**, **₹50,000** or **₹2,00,000** though none does alone.
- **Vendor matching** ignores `pvt, private, ltd, limited, llp, inc, the, and, co, company` and punctuation; names match if equal or (both at least 5 characters and one contains the other).
- **GSTIN**: format; the first two digits must be a real state code; the 15th character is a **check digit** over the first 14 (algorithm in `gstinCheckChar`); for a registered vendor the PAN inside the GSTIN must equal the vendor's PAN; a GSTIN belonging to a different registered vendor is warned.
- **TDS hint** for fee and contractor categories (superseded by the real TDS decision on vendor payments).

## 9. TDS (`src/lib/tds.js`, table `tds_rules`)

Rules are data, owned by Finance in Settings. A rule has: section, label, categories it covers, payee type (`any`, `individual`, `other`), rate, no-PAN rate, optional single-bill limit, optional yearly limit.

1. **Payee type** from the PAN's 4th letter: `P` or `H` → individual/HUF; anything else → other; no PAN → unknown (treated as "other").
2. **Rule choice** for a line's category: the rule for the payee type, else the rule for `any`, else the first covering rule.
3. **Only line items are taxed.** GST and incidentals are never part of the base.
4. **Limits.** A rule with **no limit set applies to every bill**. Otherwise it applies when the bill is over the single limit **or** the vendor's payments *under that rule* in the financial year pass the yearly limit. Lines under the same rule on one bill are **added together** before the single-bill limit is checked. On the payment that crosses the yearly limit, tax is due on everything paid so far that year ("catch-up").
5. **Rate** = the rule's rate, or `max(rate, no_pan_rate)` (default 20%) with no PAN.
6. **Amount** = round(taxable × rate ÷ 100), allocated across the lines by their share so the parts add up exactly.
7. Each vendor line ends **applicable**, **not applicable** (with the reason) or **needs a look**. Accounts can override the amount; the original is kept in the note.
8. The result is stored per line in `expense_details.tds_breakdown` (category, amount, section, rate, tds, status) plus totals on the expense (`tds_amount`, `tds_section`, `tds_rate`, `tds_status`, `tds_note`).
9. The invoice split (line items, incidentals = what is left, GST) is pre-filled from the purchase request's line items scaled to the invoice, else from items the employee listed, else one line; Accounts can edit it.

Starter rules seeded by Finance: 194J (professional fees) and 194C (contractor, individuals 1% and others 2%) with limits; Finance has added others (194BB prize, 194I rent) without limits.

## 10. Categories

- **Built-in expense categories** (`src/lib/expenseCategories.js`, 24): Travel Fare, Lodging and Boarding, Food, Bike Fare, Consultant Fee, Professional Fee,
  Retainership / Consultancy, Legal Fees, Courier, Service, Staff Welfare, Filing Fees, Furniture and Fixtures, Housekeeping, Leasehold Improvements, Medicine,
  Relocation Allowance, Repairs and Maintenance, Subscription / Software, Learning and Development, Machinery & Plants, Prize Challenge, Hiring, Other.
  PR and PO dropdowns use `src/lib/prConstants.js` (the same without Learning and Development). A new built-in must be added to both, to the Tally map and to the Hindi dictionary.
- **"Other" must say what it is** (stored in `sub_category`; as `other` on an itemized line or a TDS split line; as the item description on a PR line item).
- **Categories grow out of Other** (table `custom_categories`, function `promote_other_category`). When the same text has been typed under Other **5 times** (editable, `system_state` key `category_auto`) it becomes a category, named after its most common spelling. Counted: expense lines, itemized lines, submitted (not draft) PR items. Not counted: the legacy `Zoho category: …` text already in `sub_category`; names that already exist; vague words (other, misc, general, various, expense, none, test, unknown …); text over **40 characters** or **5 words**. Matching ignores case, punctuation, plurals and "and". Past records are never rewritten. Finance and admin are notified; Settings, Categories can hide one.
- **Tally ledgers** (`src/lib/tallyExport.js`): each category maps to a ledger name (provisional, pending Finance's chart of accounts); unmapped categories go to "Miscellaneous Expenses". Export is Tally XML or CSV of journal entries per report.
- **AI category suggestion** from a vendor name uses a fixed list (`suggestCategory`) that does not include the three newest built-ins or auto-created categories.

## 11. Document numbers and references

- PR, PO and vendor registration: `<FY>-<KIND>-07-<4 digits>` e.g. `26/27-PR-07-0053`, from `next_doc_number(kind, fy_prefix)`, one counter per kind per fiscal year, seeded from the rows already numbered that year, concurrency safe.
- Reports: `TNIE<yy><4 random digits>` (reimbursement) and `TNIV<yy>…` (vendor invoice against a PO), generated in the browser.
- Vendor id: the `VR` number.

## 12. Entity → programme → sub-programme → donor (`src/lib/donorData.js`)

- Generated from the mapping sheet (`docs/data/PRPO mapping - mapping.csv`) by `node scripts/gen-donor-map.cjs <csv>`. Do not edit the generated block by hand.
- The sheet's **Location** column is **not a form field**: `getLocation(entity, programme, sub-programme, donor)` looks it up and approvers see it small and blue in brackets next to the sub-programme. It shows nothing when a donor sits in several places under one sub-programme (today: FCRA, SAY, "Unrestricted"). Lookup ignores case and spacing. The sheet's spelling "Arunchal" is corrected to "Arunachal Pradesh".
- The older **TNF** entity is not in the sheet; it is kept (`LEGACY`) so old records resolve.
- The expense form does not ask sub-programme; it offers the programme's donors flattened.

## 13. Vendors

- **Organisation types**: Private Limited, Public Limited, LLP, Partnership, Proprietorship, HUF, Trust/NGO, Section 8 Company, Producer Company, Individual/Freelancer, Co-operative Society / AOP / SHG, Government Entity, Local Authority, Other.
- **Documents** (Finance's requirements sheet): PAN and bank details (cancelled cheque or statement) for everyone; a type-specific incorporation document (Certificate of Incorporation, Partnership Deed + LLP certificate, HUF Deed, Trust Deed, Section 8 licence …); **Aadhaar** copy instead for Individual/Freelancer and Proprietorship, with the **Aadhaar–PAN link** status and proof; **GST certificate** if GST registered; **MSME/Udyam certificate** if MSME.
- OCR reads each document and pre-fills fields; filled fields carry a green tag; anything unread is typed. Validation: PAN `AAAAA9999A`, GSTIN 15 characters (and checksum on expenses), IFSC `AAAA0XXXXXX`, 6-digit PIN, 10-digit mobile, 12-digit Aadhaar.
- **Duplicates** (PAN, organisation name, account number) are warned about but **never block** a submission.
- **Approval**: status `draft` → `pending` → `approved` / `rejected`. Only Finance members with `can_approve_vendors` (and admin, Finance Admin) can approve; others view. Only an **approved vendor** can be used on a PR. A vendor flagged "aadhaar_pan_not_linked" gets a blocking KYC email.
- **Public registration link** (`vendor_invites`): a token with expiry lets a vendor register without logging in.
- **Bank change** requests keep the old and new details (`vendor_bank_change_log`).
- A vendor from the Nucleus integration has `source = 'nucleus'`; every other is `app`.

## 14. Reminders and timing (`api/reminders.js`)

Daily at 03:30 UTC. Reminds, for anything idle 24 hours or more: draft PRs (to the requester), submitted PRs waiting at a level (to that level's people, including delegates), rejected PRs (to the requester). `last_reminder_at` stops re-notifying until about 20 hours have passed.

## 15. Other behaviours

- **30-day late warning**, **boarding pass**, and similar are in section 2.
- **Offline capture**: receipts photographed without signal are queued in the browser (IndexedDB `nudge-offline`) and uploaded later.
- **AI-generated image** label: shown when the file's metadata says it was generated or the reader is certain; never blocks. See AI_AND_OCR.md.
- **Maintenance mode**: admins can start it now or schedule it; everyone else sees a maintenance page; admins can end it.
- **Delegation**: an approver names a teammate for a date range; the delegate can act on that approver's items and the trail says "on behalf of". Admin is not delegable.
- **Language**: English or Hindi, a runtime text swap from a dictionary (`src/lib/i18n/hi.js`); unreviewed by a native speaker.
