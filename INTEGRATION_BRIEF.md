# Integration Brief: The Nudge Institute Expense Tracker
**For:** Anurag | **Platform:** Lovable (tni-workspace-360.lovable.app)  
**Context:** You are integrating a fully built React expense management system into your ERP.  
Your Claude already knows how your ERP is structured. Read this fully before touching a single file.

---

## Section 1: What This System Is

This is The Nudge Institute's internal expense tracker. It is a complete, working web app built on React 19 + Vite (plain JavaScript — no TypeScript), Supabase as the database and file storage backend, and Groq's API (llama-4-scout-17b vision model) for AI receipt parsing and policy checking.

It handles six distinct workflows:
1. Expense capture (AI receipt scanning via phone camera)
2. Expense enrichment (category, GST, invoice tagging)
3. Policy compliance checking (automated before report creation)
4. Expense report building and PDF generation
5. Multi-level approval routing (manager → functional lead → COO)
6. Finance reimbursement processing + Tally accounting export

It also has three attached modules:
- **Purchase Requests (PR):** employee raises, manager approves, triggers PO generation
- **Purchase Orders (PO):** auto-generated on PR approval, PDF stored in Supabase Storage
- **Vendor Registry:** onboarding, approval, bank detail change requests

---

## Section 2: Tech Stack — Do Not Deviate From This

| Concern | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| Language | Plain JavaScript (NO TypeScript) |
| Styling | 100% inline styles (zero CSS classes, zero Tailwind, zero CSS modules) |
| Database | Supabase (PostgreSQL) — hosted, no local backend |
| Auth | Custom localStorage session (NO Supabase Auth) |
| AI | Groq API — `meta-llama/llama-4-scout-17b-16e-instruct` |
| PDF generation | jsPDF 4 + html2canvas 1 |
| PDF parsing | pdfjs-dist 4 (for uploaded quote documents) |
| Offline | IndexedDB via `offlineQueue.js` |

**npm dependencies to install if not already present:**
```
@supabase/supabase-js ^2.106.2
html2canvas ^1.4.1
jspdf ^4.2.1
pdfjs-dist ^4.8.69
```

**Environment variables (3 secrets — NEVER commit these to git):**
```
VITE_SUPABASE_URL      = your Supabase project URL
VITE_SUPABASE_ANON_KEY = your Supabase anon/public key
VITE_GROQ_API_KEY      = Groq API key (from console.groq.com)
```

---

## Section 3: Authentication System — Very Important

There is **NO Supabase Auth**. No JWT. No OAuth. No magic links.  
Authentication is a hardcoded email whitelist stored in `src/lib/auth.js`.

**How it works:**
- User types their email on the login screen
- `auth.js` checks it against `ROLE_MAP` (hardcoded object)
- If found, saves email to localStorage key `'nudge_user_email'`
- On every page load, `getSession()` reads localStorage and reconstructs user object
- User object shape: `{ id: email, email, role, name, roleLabel }`

**Three roles exist:**
| Role | Access |
|---|---|
| `employee` | Submit expenses, raise PRs, view own history |
| `manager` | Everything employee can + Approvals tab (expense reports + PRs) |
| `finance` | Everything manager can + Finance dashboard + Vendor approval + PO management |

Roles are determined purely by email. To add a user, add their email to `ROLE_MAP` and `NAME_MAP` in `auth.js`.

**When integrating into your ERP:** if your ERP already has proper auth, replace `getSession()` to return a user object from YOUR auth system. Keep the same object shape: `{ email, role, name, roleLabel }`. The role must be one of: `'employee'`, `'manager'`, `'finance'`.

---

## Section 4: Supabase Database — Complete Schema

You need these 11 tables in your Supabase project. All tables have auto-generated `id` (UUID) and `created_at` (timestamptz) columns.

### Table 1: `expense_captures`
Purpose: Raw data from AI receipt scanning (Layer 1 capture)

| Column | Type | Notes |
|---|---|---|
| `receipt_path` | text | Supabase Storage path to receipt image |
| `payment_path` | text | Supabase Storage path to payment proof image |
| `receipt_data` | jsonb | AI-extracted: `{amount, vendor, date, invoice_number, gstin}` |
| `payment_data` | jsonb | AI-extracted: `{upi_id, amount, transaction_ref, payment_method}` |
| `amount` | numeric | Final extracted amount |
| `vendor` | text | Vendor/merchant name |
| `date` | text | **DD/MM/YYYY format — stored as string, not date type** |
| `payment_method` | text | `'upi'`, `'cash'`, `'card'`, `'bank_transfer'`, `'other'` |
| `category` | text | Initial AI-guessed category |
| `invoice_number` | text | |
| `gstin` | text | |
| `quality_override` | boolean | true if user overrode low-quality doc warning |

### Table 2: `expense_details`
Purpose: Enriched expense record after user fills Layer 2 form

| Column | Type | Notes |
|---|---|---|
| `capture_id` | uuid | FK → `expense_captures.id` (nullable) |
| `amount` | numeric | NOT NULL |
| `vendor` | text | |
| `date` | text | DD/MM/YYYY |
| `category` | text | |
| `expense_type` | text | `'just_me'` or `'my_team'` |
| `invoice_number` | text | |
| `gstin` | text | |
| `description` | text | User's note/context |
| `payment_method` | text | |
| `submitted_at` | timestamptz | |
| `user_email` | text | Owner's email |
| `status` | text | DEFAULT `'saved'` |
| `reimbursement_type` | text | `'direct_reimbursement'`, `'advance_settlement'`, etc. |
| `entity` | text | `'TNI'`, `'NLF FCRA'`, `'TNF US'`, etc. |
| `trip_name` | text | |
| `trip_related` | boolean | |

### Table 3: `expense_reports`
Purpose: A grouped report submitted for reimbursement

| Column | Type | Notes |
|---|---|---|
| `report_reference` | text | Display ID like `'EXP-2025-0042'` |
| `total_amount` | numeric | |
| `expense_count` | integer | |
| `status` | text | `'submitted'` \| `'under_review'` \| `'approved'` \| `'processing'` \| `'reimbursed'` \| `'rejected'` |
| `brand` | text | `'The/Nudge'`, `'the^delta'`, `'the*spark'` |
| `employee_email` | text | Submitter's email |
| `pr_id` | uuid | FK → `purchase_requests.id` (nullable, auto-linked) |
| `link_confidence` | text | `'high'`, `'medium'`, `'manual'`, null |
| `approved_at` | timestamptz | |
| `reimbursed_at` | timestamptz | |
| `rejected_at` | timestamptz | |
| `rejection_reason` | text | |
| `reviewed_by` | text | |
| `reviewed_at` | timestamptz | |
| `vouched_by` | text | Finance team member who processed payment |

### Table 4: `report_expenses`
Purpose: Join table linking expenses to reports (many-to-many)

| Column | Type | Notes |
|---|---|---|
| `report_id` | uuid | NOT NULL, FK → `expense_reports.id` |
| `expense_id` | uuid | NOT NULL, FK → `expense_details.id` |

### Table 5: `report_approvals`
Purpose: One row per approval level per report

| Column | Type | Notes |
|---|---|---|
| `report_id` | uuid | NOT NULL, FK → `expense_reports.id` |
| `approver_level` | text | `'reporting_manager'` \| `'functional_lead'` \| `'coo'` |
| `approver_name` | text | Human-readable level name |
| `status` | text | `'pending'` \| `'waiting'` \| `'approved'` \| `'rejected'` |
| `notes` | text | Approver's comment / rejection reason |
| `due_at` | timestamptz | 48h from creation |
| `actioned_at` | timestamptz | |
| `approver_email` | text | Who actually clicked approve |

### Table 6: `expense_notifications`
Purpose: In-app notification messages

| Column | Type | Notes |
|---|---|---|
| `recipient_id` | text | Email of who should see this |
| `report_id` | uuid | FK → `expense_reports.id` (nullable) |
| `type` | text | `'approval_needed'` \| `'approved'` \| `'rejected'` \| `'reimbursed'` \| `'pr_approved'` \| `'link_suggestion'` |
| `message` | text | |
| `read` | boolean | DEFAULT false |

### Table 7: `purchase_requests`
Purpose: Employee raises a PR to purchase something from a vendor

| Column | Type | Notes |
|---|---|---|
| `pr_number` | text | UNIQUE — `'TNI-PR-2025-0001'` |
| `requested_by` | text | Employee email |
| `vendor_id` | uuid | FK → `vendors.id` |
| `amount` | numeric | |
| `category` | text | |
| `entity` | text | Which entity this spend belongs to |
| `program` | text | |
| `subprogram` | text | |
| `impact_stream` | text | |
| `purpose` | text | Detailed justification |
| `status` | text | `'draft'` \| `'submitted'` \| `'approved'` \| `'rejected'` \| `'po_generated'` |
| `is_recurring` | boolean | |
| `recurring_frequency` | text | `'One-time'` \| `'Monthly'` \| `'Quarterly'` \| `'Annually'` |
| `quote_path` | text | Supabase Storage path for uploaded quote |
| `quote_extracted_data` | jsonb | AI-extracted quote data |
| `submitted_at` | timestamptz | |
| `linked_expense_report_id` | uuid | FK → `expense_reports.id` (auto-linked) |
| `link_confidence` | text | |

### Table 8: `pr_approvals`
Purpose: Approval chain for purchase requests

| Column | Type | Notes |
|---|---|---|
| `pr_id` | uuid | NOT NULL, FK → `purchase_requests.id` |
| `approver_level` | integer | 1, 2, 3 |
| `approver_name` | text | |
| `status` | text | `'pending'` \| `'waiting'` \| `'approved'` \| `'rejected'` |
| `actioned_at` | timestamptz | |
| `approver_email` | text | |

### Table 9: `purchase_orders`
Purpose: Auto-generated when a PR is fully approved

| Column | Type | Notes |
|---|---|---|
| `po_number` | text | UNIQUE — `'TNI-PO-2025-0001'` |
| `pr_id` | uuid | FK → `purchase_requests.id` |
| `vendor_id` | uuid | FK → `vendors.id` |
| `amount` | numeric | |
| `entity` | text | |
| `status` | text | `'issued'` \| `'completed'` \| `'cancelled'` |
| `generated_at` | timestamptz | |
| `pdf_storage_path` | text | Path in `po-pdfs` bucket |

### Table 10: `vendors`
Purpose: Approved vendor registry

| Column | Type | Notes |
|---|---|---|
| `vendor_id` | text | UNIQUE — `'TNI-VT-2025-0001'` |
| `org_name` | text | NOT NULL |
| `org_type` | text | `'Private Limited'` \| `'LLP'` \| `'Trust/NGO'` \| `'Individual/Freelancer'` etc. |
| `pan_number` | text | Validated: `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/` |
| `gstin` | text | Validated: standard GSTIN regex |
| `contact_person` | text | |
| `phone` | text | 10-digit |
| `email` | text | |
| `address` | text | |
| `state` | text | Indian state name |
| `pincode` | text | 6-digit |
| `account_number` | text | Bank account |
| `ifsc_code` | text | `/^[A-Z]{4}0[A-Z0-9]{6}$/` |
| `bank_name` | text | |
| `branch` | text | |
| `beneficiary_name` | text | |
| `status` | text | `'pending'` \| `'approved'` \| `'rejected'` \| `'bank_change_requested'` |
| `approved_by` | text | Email of approver |
| `approved_at` | timestamptz | |
| `rejection_reason` | text | |
| `resubmission_count` | integer | DEFAULT 0 |

### Table 11: `vendor_bank_changes`
Purpose: When an approved vendor needs to change bank details

| Column | Type | Notes |
|---|---|---|
| `vendor_id` | uuid | FK → `vendors.id` |
| `requested_by` | text | Email |
| `new_account_number` | text | |
| `new_ifsc_code` | text | |
| `new_bank_name` | text | |
| `new_branch` | text | |
| `new_beneficiary_name` | text | |
| `status` | text | `'pending'` \| `'approved'` \| `'rejected'` |
| `reviewed_by` | text | |
| `reviewed_at` | timestamptz | |

---

## Section 5: Supabase Storage Buckets

Create these two buckets in Supabase Storage:

### `expense-documents`
- Stores: receipt photos, payment proof photos, uploaded quote files
- Paths used:
  - `captures/{timestamp}-receipt.jpg`
  - `captures/{timestamp}-payment.jpg`
  - `quotes/{pr_number}-quote.{ext}`
- Make public OR use signed URLs (the code uses `.getPublicUrl()` on read)

### `po-pdfs`
- Stores: auto-generated Purchase Order PDFs
- Paths used: `po_pdfs/{po_number}.pdf`
- Access: signed URLs (code uses `createSignedUrl` with 3600s TTL)

---

## Section 6: Supabase Realtime

Enable Realtime on the `expense_reports` table. The app subscribes to UPDATE events filtered by `id` to detect when a report's status changes to `'reimbursed'`, which triggers the `ReimbursedConfirmation` screen automatically without any refresh.

Also enable on `expense_notifications` if you want live notification bell updates.

---

## Section 7: Complete File Directory

```
src/
├── main.jsx                    Entry point, renders <App /> into #root
├── App.jsx                     THE ENTIRE ROUTER. One giant state machine.
│                               No react-router. appScreen state controls which
│                               component renders. 220px left sidebar + content area.
│
├── lib/
│   ├── supabase.js             createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
│   │                           Single exported instance: supabase
│   ├── auth.js                 Hardcoded ROLE_MAP, NAME_MAP. Functions: signIn(),
│   │                           signOut(), getSession(), buildUser(), getRoleFromEmail(),
│   │                           canAccessApprovals(role), canAccessFinance(role)
│   ├── claude.js               All Groq API calls. Functions: callGroq() (base),
│   │                           extractReceiptData(), extractPaymentData(),
│   │                           detectUPI(), suggestCategory(), generatePRSummary(),
│   │                           extractQuoteData()
│   ├── policyEngine.js         ALL expense policy rules. Hard checks (blocking) +
│   │                           soft flags (warnings). Key functions:
│   │                           checkSubmissionTiming() — must claim within 7 days
│   │                           checkHotelLimit() — ₹4000 metro / ₹3250 non-metro per night
│   │                           checkFoodLimit() — ₹750 per day max
│   │                           checkDocumentsPresent() — boarding pass for flights
│   │                           checkLargeClaimDonorMention() — donor ref for >₹20k
│   │                           checkNonReimbursableAI() — Groq AI content check
│   │                           flagDuplicateExpense() — same vendor+amount+date
│   │                           flagAmountPatternNearThreshold() — near ₹50k/₹2L
│   │                           determineApprovalRoute() — routes by max amount
│   │                           runAllChecks() — runs all checks in parallel
│   ├── approvalEngine.js       Multi-level approval logic:
│   │                           getApprovalLevels(totalAmount) — returns levels array
│   │                           createApprovalRecords() — inserts report_approvals
│   │                           processApproval() — approves/rejects one level,
│   │                             promotes next waiting level, marks report approved
│   │                           createNotification() — inserts expense_notifications
│   │                           STATUS_STEP, STATUS_LABEL maps
│   ├── pdfGenerator.js         Generates PO PDF using jsPDF + html2canvas from
│   │                           POTemplate component. generatePOPDF(), uploadPDFToSupabase()
│   ├── exportUtils.js          Generates expense report PDFs (jsPDF)
│   ├── tallyExport.js          Exports reimbursed reports in Tally-compatible format
│   ├── linkEngine.js           Auto-links PRs to expense reports using fuzzy matching:
│   │                           Dice coefficient on vendor names + amount proximity +
│   │                           date proximity + same employee email. Score threshold: 50.
│   │                           High confidence: ≥80, Medium: 50-79
│   │                           autoLinkPRToExpense(triggerId, triggerType)
│   │                           manualLinkPRToExpense(prId, expenseReportId)
│   └── offlineQueue.js         IndexedDB queue. When offline, saves capture data locally.
│                               On reconnect, syncs to Supabase storage.
│
├── hooks/
│   └── useNetworkStatus.js     Detects online/offline via navigator.onLine + events
│
└── components/
    ├── auth/
    │   └── LoginScreen.jsx     Email input → calls signIn() → calls onLogin(user)
    │
    ├── capture/                LAYER 1: Physical expense capture
    │   ├── NewExpense.jsx      Orchestrates Step1 → Step2 → CrossValidation → Confirmation
    │   │                       Also handles offline queue sync on mount
    │   ├── Step1Receipt.jsx    Camera/upload receipt → extractReceiptData() via Groq
    │   │                       Reads: amount, vendor, date, invoice_number, gstin
    │   ├── Step2Payment.jsx    Camera/upload payment proof → extractPaymentData() via Groq
    │   │                       Reads: UPI ID, amount, transaction ref
    │   ├── CrossValidation.jsx Compares Step1 amount vs Step2 amount. Saves to
    │   │                       expense_captures. Uploads images to Storage.
    │   ├── ConfirmationScreen.jsx "Your receipt has been saved!" Calls onContinueToDetails.
    │   ├── QualityCheck.jsx    Warns if image is blurry/unclear. User can override.
    │   └── OfflineBanner.jsx   Red banner shown when navigator.onLine is false
    │
    ├── layer2/                 LAYER 2: Expense detail enrichment
    │   ├── ConfirmExtracted.jsx Shows AI-extracted data for confirmation/edit. Has CATEGORIES.
    │   ├── ExpenseDetails.jsx  Main detail form: amount, vendor, date, category,
    │   │                       expense_type, invoice_number, gstin, note
    │   │                       Saves to expense_details table
    │   ├── ExpenseHistoryScreen.jsx History tab. Shows all expense_details for user.
    │   ├── ExpenseList.jsx     Card list of expense_details
    │   ├── QuestionScreen.jsx  Reusable single-question step component
    │   ├── ExpenseType.jsx     Just me vs. multiple people selector
    │   ├── PurposeType.jsx     Trip purpose selector
    │   ├── ReimbursementType.jsx Direct / advance settlement selector
    │   ├── TripContext.jsx     Trip name and context entry
    │   ├── PriorApproval.jsx   Was there a prior approval? yes/no
    │   ├── BrandSelect.jsx     Which brand: The/Nudge, the^delta, the*spark
    │   ├── AttendeeCount.jsx   For team meals: how many people
    │   └── Layer2Summary.jsx   Shows all entered Layer 2 data
    │
    ├── layer3/                 LAYER 3: Policy compliance gate
    │   ├── PolicyCheck.jsx     Runs runAllChecks() on all expenses in parallel.
    │   │                       Shows loading, then violations or flags or proceed.
    │   ├── PolicyLoading.jsx   Spinner while checks run
    │   ├── PolicyViolation.jsx Hard block screen. User must fix before proceeding.
    │   ├── PolicyFlag.jsx      Soft warning. User can acknowledge and proceed.
    │   ├── PolicyResult.jsx    Summary of all passed/flagged checks
    │   └── ApprovalRoute.jsx   Shows which approval route this report needs
    │
    ├── layer4/                 LAYER 4: Report building
    │   ├── ExpenseSelector.jsx Pick which saved expenses go into this report
    │   ├── ReportDetails.jsx   Enter trip name, entity, brand, program details
    │   ├── ReportPreview.jsx   Final preview before submission. Creates expense_reports
    │   │                       + report_expenses. Calls createApprovalRecords().
    │   │                       Calls autoLinkPRToExpense(). Generates report PDF.
    │   ├── ReportSummaryCard.jsx Summary card component
    │   ├── PDFTemplate.jsx     HTML template used by jsPDF to render expense report PDF
    │   ├── GeneratingPDF.jsx   Loading screen while PDF generates
    │   └── ExpenseLineItem.jsx Single expense row in report
    │
    ├── layer5/                 LAYER 5: Submission + approval
    │   ├── SubmissionConfirmation.jsx "Report submitted!" + track/new buttons
    │   ├── ReportStatus.jsx    Employee's view of their report status + timeline
    │   ├── StatusTimeline.jsx  Visual step tracker (submitted → reviewed → approved → paid)
    │   ├── ApproverDashboard.jsx Manager's list of reports pending approval
    │   ├── ApproverReportView.jsx Manager's detail view: see all expenses + approve/reject
    │   ├── ExpenseApprovalCard.jsx Single expense card in approver view
    │   ├── RejectionModal.jsx  Modal for entering rejection reason
    │   ├── HomeScreenAddons.jsx Home screen widgets for manager (pending count badge, etc.)
    │   └── NotificationToast.jsx Slide-up toast (info / approved / rejected)
    │
    ├── layer6/                 LAYER 6: Finance operations
    │   ├── FinanceDashboard.jsx Tabbed dashboard:
    │   │                        Overview | All Reports | Pending Payment | History | Tally
    │   ├── AdminStats.jsx      KPI cards: total spend, pending count, avg processing time
    │   ├── AdminAllReports.jsx All reports with filters by status/brand/date
    │   ├── AdminReportDetail.jsx Finance view of a report with full expense breakdown
    │   ├── ReimbursementBatch.jsx Batch process approved reports: mark as reimbursed
    │   ├── ReimbursementCard.jsx Single report card in batch view
    │   ├── ReimbursedConfirmation.jsx "You've been reimbursed!" (realtime triggered)
    │   ├── TallyExportView.jsx Export reimbursed reports as Tally voucher format
    │   └── FinanceNavButton.jsx Finance-specific nav utility component
    │
    ├── pr/                     PURCHASE REQUEST MODULE
    │   ├── PRList.jsx          List of PRs. Employee sees own. Manager/finance see all.
    │   │                       Tabs: All / Draft / Submitted / Approved / Rejected
    │   ├── PRForm.jsx          4-step PR creation form:
    │   │                       Step 0: Vendor selection (uses VendorSelector)
    │   │                       Step 1: Amount, category, entity, program, purpose
    │   │                       Step 2: Upload quote (QuoteUpload)
    │   │                       Step 3: Review and submit
    │   │                       PR number: TNI-PR-{year}-{NNNN}
    │   ├── PRDetail.jsx        Employee view of a single PR: details + status timeline
    │   ├── PRApproverDashboard.jsx Manager's list of PRs pending approval
    │   ├── PRApproverView.jsx  Manager's approval screen for a PR.
    │   │                       On last-level approve:
    │   │                         → generates PO PDF + uploads to Storage
    │   │                         → calls autoLinkPRToExpense('pr')
    │   │                         → sends notification to requester
    │   ├── PRStatusTimeline.jsx Visual timeline for PR approval stages
    │   ├── VendorSelector.jsx  Search vendors dropdown (only approved vendors)
    │   ├── QuoteUpload.jsx     Upload/camera capture of vendor quote.
    │   │                       Calls extractQuoteData() via Groq on PDF/image
    │   └── POTemplate.jsx      Invisible HTML template rendered to generate PO PDF.
    │                           Contains: PO number, vendor details, bank details,
    │                           PR details, amount, entity, purpose
    │
    ├── po/                     PURCHASE ORDER MODULE
    │   ├── POList.jsx          Lists all POs. Finance sees all. Employee sees own PRs' POs.
    │   │                       Tabs: All / Issued / Completed / Cancelled
    │   └── PODetail.jsx        Detailed PO view: header, vendor card, payment card,
    │                           PR purpose, finance actions (Complete / Cancel)
    │
    ├── vendor/                 VENDOR REGISTRY MODULE
    │   ├── VendorList.jsx      All vendors. Finance sees all. Employee sees approved only.
    │   ├── VendorSearch.jsx    Duplicate check before creating. If found → detail. If not → create.
    │   ├── VendorForm.jsx      Full vendor onboarding form (3 sections):
    │   │                       1. Organisation: org_name, org_type, PAN, GSTIN
    │   │                       2. Contact: person, phone, email, address, state, pincode
    │   │                       3. Banking: account, IFSC, bank_name, branch, beneficiary
    │   │                       Validates PAN, GSTIN, IFSC, phone, pincode
    │   │                       Vendor ID auto-generated: TNI-VT-{year}-{NNNN}
    │   │                       Status on submit: 'pending'
    │   ├── VendorDetail.jsx    Full vendor profile. Finance can approve/reject.
    │   ├── VendorApprovalView.jsx Finance approves or rejects a pending vendor.
    │   ├── BankChangeRequest.jsx Inserts to vendor_bank_changes. Finance reviews.
    │   └── VendorStatusBadge.jsx Reusable colored badge: Approved / Pending / Rejected
    │
    └── shared/
        └── ReportChat.jsx      AI chat sidebar on report detail pages (Groq-powered)
```

---

## Section 8: Navigation and Routing (App.jsx State Machine)

There is **NO react-router-dom**. Navigation is pure React state.

**Primary state: `appScreen` (string)**

| Value | Screen |
|---|---|
| `'list'` | Home screen |
| `'capture'` | Receipt capture (Layer 1) |
| `'details'` | Expense detail form (Layer 2) |
| `'policy'` | Policy check (Layer 3) |
| `'layer4'` | Report builder (Layer 4) |
| `'layer5'` | Submission confirmation (Layer 5) |
| `'status'` | Report status tracking |
| `'approvals'` | Approvals hub |
| `'approval-view'` | Single report approver view |
| `'finance'` | Finance dashboard (Layer 6) |
| `'reimbursed'` | Reimbursed confirmation |
| `'history'` | Expense history |
| `'vendors'` | Vendor module |
| `'pr-list'` | Purchase Requests module |
| `'pr-approval-view'` | Single PR approver view |
| `'po-list'` | Purchase Orders module |

**Secondary states for sub-screens:**
```
vendorSubScreen:  'list' | 'search' | 'form' | 'detail' | 'approval' | 'bank-change'
prSubScreen:      'list' | 'form' | 'detail'
poSubScreen:      'list' | 'detail'
layer4Screen:     'selector' | 'details' | 'preview'
approvalsTab:     'expenses' | 'prs'
```

**`SCREEN_PARENT` map** (for sidebar active highlight when in sub-screens):
```
capture, details, policy, layer4, layer5, status, reimbursed  →  highlight 'list'
approval-view, pr-approval-view                                →  highlight 'approvals'
po-list                                                        →  highlight 'po-list'
```

**Left sidebar nav items:**

| Icon | Label | Screen key | Visible to |
|---|---|---|---|
| ⊞ | Home | `list` | All roles |
| ☰ | History | `history` | All roles |
| ✓ | Approvals | `approvals` | Manager + Finance |
| ₹ | Finance | `finance` | Finance only |
| ◫ | Purchase Requests | `pr-list` | All roles |
| ◻ | Purchase Orders | `po-list` | All roles |
| ⬡ | Vendors | `vendors` | All roles |

Plus two action shortcuts below the nav divider:
- `+ New Expense` (salmon `#E8A090`) — goes to capture screen
- `◷ New Report` (muted `#c4826f`) — goes to layer4 screen

---

## Section 9: Expense Flow — Step by Step Data Journey

### Flow A: Submitting an expense

```
Step1Receipt
  → Groq extracts: amount, vendor, date, invoice_number, gstin
  → Stored in state as receiptData

Step2Payment
  → Groq extracts: UPI ID, amount, transaction ref, payment_method
  → Stored in state as paymentData

CrossValidation
  → Compares receiptData.amount vs paymentData.amount
  → If ONLINE:  uploads images → expense-documents bucket
                inserts row  → expense_captures
  → If OFFLINE: saves to IndexedDB (offlineQueue.js)
                syncs automatically next time online

ExpenseDetails (Layer 2)
  → User confirms/edits: amount, vendor, date, category,
    expense_type, invoice_number, gstin, note
  → INSERT expense_details (capture_id FK, user_email)
```

### Flow B: Creating and submitting a report

```
PolicyCheck (Layer 3)
  → Fetches user's expense_details where status='saved'
  → runAllChecks() on each expense:
      Hard checks: timing, hotel limit, food limit, boarding pass,
                   large claim donor, exclusion categories, per-km rate, AI check
      Soft flags:  late flight, handwritten bill, duplicate, near-threshold,
                   FCRA entity, open advance
  → Hard violations (passed:false)  → BLOCK — user must fix
  → Soft flags    (flagged:true)    → WARNING — user acknowledges and proceeds

Report building: ExpenseSelector → ReportDetails → ReportPreview
  → User picks expenses
  → User fills: trip name, entity, brand, program, sub-program, impact stream
  → On submit:
      INSERT expense_reports (status='submitted')
      INSERT report_expenses for each selected expense
      createApprovalRecords() → report_approvals rows created
        Level 1 → status='pending', others → status='waiting'
      autoLinkPRToExpense(reportId, 'expense_report')

Manager approves (ApproverReportView):
  → Approve current level:
      If next level exists → next level 'pending', report → 'under_review'
      If no more levels   → report → 'approved'
  → Reject:
      Report → 'rejected', rejection_reason set

Finance (ReimbursementBatch):
  → Marks approved reports: 'approved' → 'processing' → 'reimbursed'
  → Realtime event fires → ReimbursedConfirmation appears for employee
```

### Flow C: Purchase Request → Purchase Order

```
PRForm (4 steps):
  Step 0: Select vendor from approved vendor list
  Step 1: amount, category, entity, program, subprogram, impact_stream, purpose
  Step 2: Upload quote (Groq extracts data)
  Step 3: Review → Submit
  → PR number: TNI-PR-{year}-{NNNN}
  → INSERT purchase_requests (status='submitted')
  → INSERT pr_approvals (same tier logic as expense reports)

Manager approves (PRApproverView):
  → Same pending/waiting chain as expense reports
  → When LAST level approves:
      UPDATE purchase_requests.status = 'approved'
      generatePONumber() → TNI-PO-{year}-{NNNN}
      Render POTemplate → jsPDF → PDF generated
      Upload PDF → po-pdfs bucket at po_pdfs/{po_number}.pdf
      INSERT purchase_orders: {po_number, pr_id, vendor_id, amount, entity, status:'issued', pdf_storage_path}
      autoLinkPRToExpense(prId, 'pr')
      INSERT expense_notifications for requester (type: 'pr_approved')

Employee downloads PO PDF from PODetail.
Finance marks PO as Completed or Cancelled.
```

---

## Section 10: Approval Tier Logic

Used by **both** expense reports **and** purchase requests.

**`getApprovalLevels(totalAmount)` in `approvalEngine.js`:**

| Amount | Levels |
|---|---|
| ≤ ₹50,000 | 1 level: `reporting_manager` |
| ₹50,001 – ₹2,00,000 | 2 levels: `reporting_manager` → `functional_lead` |
| > ₹2,00,000 | 3 levels: `reporting_manager` → `functional_lead` → `coo` |

**Status meanings:**

| Status | Meaning |
|---|---|
| `'pending'` | Currently awaiting action from this level |
| `'waiting'` | Not yet unlocked (previous level not approved yet) |
| `'approved'` | This level approved |
| `'rejected'` | This level rejected |

**On approval of level N:**
- Level N → `'approved'`
- If level N+1 exists → N+1 → `'pending'`
- If no more levels → report/PR → `'approved'` (final)

**On rejection at any level:**
- That level → `'rejected'`
- Report/PR → `'rejected'` with `rejection_reason`
- All other levels stay as-is

**SLA:** `due_at` = creation + 48 hours (for expense report approvals)

---

## Section 11: AI Integration (Groq)

```
Base URL: https://api.groq.com/openai/v1/chat/completions
Model:    meta-llama/llama-4-scout-17b-16e-instruct
Auth:     Bearer {VITE_GROQ_API_KEY}
```

All calls are made from the **browser (client-side)**. This works because Groq supports CORS. Do NOT proxy through a backend.

**Six AI functions in `src/lib/claude.js`:**

| Function | Input | Returns |
|---|---|---|
| `extractReceiptData(base64Image)` | Receipt photo | `{amount, vendor, date, invoice_number, gstin}` |
| `extractPaymentData(base64Image)` | Payment proof photo | `{upi_id, amount, transaction_ref, payment_method}` |
| `detectUPI(base64Image)` | Payment proof | boolean |
| `suggestCategory(vendorName)` | Vendor name string | Category string |
| `generatePRSummary(prDetails)` | PR object | 2-3 sentence summary |
| `extractQuoteData(base64Image)` | Quote document | `{vendor, amount, description, validity}` |

**Plus in `policyEngine.js`:**

`checkNonReimbursableAI(expense)` — text-only Groq call, checks if expense contains non-reimbursable items. Returns `{contains_non_reimbursable, reason, confidence}`.
- High confidence → hard block
- Medium confidence → soft flag

---

## Section 12: Expense Categories (20 Categories)

Used in `ExpenseDetails.jsx`, `ConfirmExtracted.jsx`, `PRForm.jsx`:

```
Travel Fare, Lodging and Boarding, Food, Bike Fare,
Consultant Fee, Professional Fee, Retainership / Consultancy,
Legal Fees, Courier, Service, Staff Welfare, Filing Fees,
Furniture and Fixtures, Housekeeping, Leasehold Improvements,
Medicine, Relocation Allowance, Repairs and Maintenance,
Subscription / Software, Other
```

---

## Section 13: Brand Colors (The Nudge Institute)

| Usage | Color |
|---|---|
| Sidebar background | `#1C0A06` (very dark warm brown) |
| Primary / CTA buttons | `#8C3225` (terracotta / dark maroon) |
| Active sidebar item text + border | `#E8A090` (salmon) |
| Muted text / inactive nav | `#c4826f` (medium terracotta) |
| Content background | `#F4F5F7` (light grey) |
| Sidebar shadow | `rgba(140,50,37,0.25)` |
| Active item background | `rgba(140,50,37,0.25)` |
| Light tint (badge backgrounds) | `#fdf0ed` |
| Lighter tint | `#fce8e4` |

> Do NOT use purple (`#7e14ff`, `#ede6ff`, `#f3ebff`, `#1565C0`) anywhere except inside `PDFTemplate.jsx` and `POTemplate.jsx` which may retain different print styling.

---

## Section 14: ID / Numbering Formats

| Type | Format | Example |
|---|---|---|
| Purchase Request | `TNI-PR-{YYYY}-{NNNN}` | `TNI-PR-2025-0042` |
| Purchase Order | `TNI-PO-{YYYY}-{NNNN}` | `TNI-PO-2025-0017` |
| Vendor ID | `TNI-VT-{YYYY}-{NNNN}` | `TNI-VT-2025-0008` |

All generated by counting existing rows for the year:
```js
const { count } = await supabase
  .from('table_name')
  .select('id', { count: 'exact', head: true })
  .like('id_column', `TNI-XX-${year}-%`)
return `TNI-XX-${year}-${((count || 0) + 1).toString().padStart(4, '0')}`
```

---

## Section 15: What to Change for ERP Integration

### Priority 1 — Must change immediately

**A. `src/lib/auth.js`**
- Replace `ROLE_MAP` and `NAME_MAP` with lookups from your ERP's user database
- OR replace `getSession()` / `signIn()` entirely to use your existing auth token
- Keep the returned user object shape: `{ email, role, name, roleLabel }`
- `role` MUST be one of: `'employee'`, `'manager'`, `'finance'`

**B. `src/lib/supabase.js`**
- Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` point to the correct project
- If using your ERP's existing Supabase project: point here. If separating: use a dedicated project.

**C. `App.jsx` — sidebar integration**
- Two options:
  - **Option 1 (Recommended):** Mount the entire expense tracker as a sub-application inside one ERP sidebar item. Your ERP sidebar has one entry "Expense Tracker" that renders a self-contained `<ExpenseApp />` — which is `App.jsx` renamed and stripped of its own sidebar, leaving just the content area + state machine.
  - **Option 2:** Deeply integrate each module (expenses, PR, PO, vendors) as separate top-level routes in your ERP. Requires significant rework of `App.jsx`. Not recommended.

### Priority 2 — Should change

**D. Entities / programs / brands**
- Currently hardcoded in multiple form components
- Replace with your actual TNI entities: `'TNI'`, `'NLF FCRA'`, `'TNF US'`, etc.
- Programs/sub-programs in `PRForm` — replace with your actual program list

**E. Approver email mapping**
- Currently any user with role `'manager'` can approve any report
- If your ERP has reporting manager relationships, wire approver routing to the employee's actual manager
- To add: add `manager_email` to user profiles, pass into `createApprovalRecords()` so the right person is notified

**F. `expense_notifications` recipient logic**
- Currently uses email strings as `recipient_id`
- If your ERP has its own notification system, redirect `createNotification()` to use it

### Priority 3 — Optional improvements

**G. Tally export format (`tallyExport.js`)**
- Adjust the voucher format to match your exact Tally company configuration

**H. PDF templates (`PDFTemplate.jsx`, `POTemplate.jsx`)**
- Update with The Nudge Institute's letterhead, logo, and registered address
- Currently generic

**I. Policy limits (`policyEngine.js`)**
- Hotel limits: ₹4,000 metro / ₹3,250 non-metro
- Food limit: ₹750/day
- Submission timing: 7 days
- Per-km rates: ₹15/km car, ₹5/km bike
- Approval thresholds: ₹50,000 and ₹2,00,000

---

## Section 16: What NOT to Change

- Do **NOT** convert to TypeScript
- Do **NOT** add CSS classes or Tailwind — everything uses inline styles intentionally
- Do **NOT** add react-router — the state machine pattern is intentional
- Do **NOT** change the database table names — referenced by string throughout the codebase
- Do **NOT** change Supabase column names — same reason
- Do **NOT** change approval status strings (`'pending'`, `'waiting'`, `'approved'`, `'rejected'`) — compared by string equality throughout
- Do **NOT** change report status strings (`'submitted'`, `'under_review'`, `'approved'`, `'processing'`, `'reimbursed'`, `'rejected'`) — used in `STATUS_STEP` map
- Do **NOT** remove the FCRA-specific checks in `policyEngine.js` — legally required for NLF FCRA entity

---

## Section 17: Known Quirks / Things to Watch

1. **Dates stored as strings:** Dates in `expense_details` are stored as `DD/MM/YYYY` text (not SQL `date` type). `policyEngine.js` has `parseExpenseDate()` that handles multiple formats. Don't change this.

2. **Employee PO visibility:** In `POList.jsx`, employee-only filtering is done client-side after fetching. For large orgs, move this to a Supabase RLS policy.

3. **PDF generation:** jsPDF screenshots a hidden DOM element (`POTemplate`, `PDFTemplate`) using html2canvas. The component **must be rendered in the DOM** at the moment of generation. `PRApproverView` uses a ref (`poRef`) to render the hidden `POTemplate` before calling `generatePOPDF()`. Do not remove the hidden render.

4. **AI category suggestion:** `suggestCategory()` is called in `ExpenseDetails` on mount with the vendor name from the receipt. It pre-fills the category dropdown. Non-blocking — if Groq fails, dropdown starts empty.

5. **Offline queue:** `offlineQueue.js` uses browser IndexedDB. Offline captures are stored locally and synced when back online. Runs automatically on `NewExpense` mount.

6. **Vendor duplicate check:** Before creating a vendor, `VendorSearch` shows existing vendors with matching names (case-insensitive `ILIKE`). This prevents duplicate vendor records.

7. **Auto-linking:** `linkEngine.js` uses a scoring algorithm (Dice coefficient string similarity + amount proximity + date proximity + same employee) to auto-link PRs to expense reports. Score ≥ 50 triggers a link. Score ≥ 80 is `'high'` confidence. Medium confidence creates a finance notification for manual verification.

8. **Realtime subscription:** `App.jsx` subscribes to `expense_reports` changes only when `currentReportId` is set. The subscription is cleaned up on unmount via the `useEffect` return function. Enable Realtime on the table in Supabase or the subscription will silently fail.

9. **Same approval engine for PRs and expenses:** Both use `getApprovalLevels()` from `approvalEngine.js`. But PRs store results in `pr_approvals` while expenses use `report_approvals`.

10. **Finance + Manager both see Approvals:** `canAccessApprovals(role)` returns true for both. In the Approvals tab: `'Expense Reports'` tab uses `ApproverDashboard`, `'Purchase Requests'` tab uses `PRApproverDashboard`.

---

## Section 18: Checklist Before Going Live

- [ ] All 11 Supabase tables created with correct column types
- [ ] `expense-documents` storage bucket created
- [ ] `po-pdfs` storage bucket created
- [ ] Realtime enabled on `expense_reports` table
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in `.env`
- [ ] `VITE_GROQ_API_KEY` set in `.env`
- [ ] `.env` added to `.gitignore`
- [ ] `ROLE_MAP` and `NAME_MAP` in `auth.js` updated with all real employee emails + roles
- [ ] Supabase Row Level Security (RLS): configure policies so employees can only read/write their own `expense_details` and `expense_captures`
- [ ] Test full flow: capture → details → policy → report → approval → finance → reimbursed
- [ ] Test PR flow: raise PR → manager approve → PO generated → finance mark complete
- [ ] Test vendor flow: add vendor → finance approve → use in PR

---

## Section 19: Running It Locally

**Requirements:** Node 20+  
No backend to run — Supabase is the backend (hosted). No Docker. No server.

```bash
npm install

# Create .env with the 3 secrets:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# VITE_GROQ_API_KEY=...

npm run dev
# Opens at http://localhost:5173
```

**Build for production:**
```bash
npm run build
# Outputs to dist/ — deploy to Vercel, Netlify, or any static host
```

---

*Start with Section 15 (what to change) and Section 18 (checklist). Every table, flow, file, and quirk is documented above.*
