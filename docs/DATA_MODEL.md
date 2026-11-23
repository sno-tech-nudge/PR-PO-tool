# Data model

Generated from the live database on 2026-11-22 by `npm run migration:docs`. Do not edit by hand: regenerate.
The exact, replayable schema is `docs/database/schema.sql`. This file explains it.

27 tables in the `public` schema, plus Supabase Storage. Row counts are a snapshot, not a rule.

## Conventions

- "Enums" are plain text columns, not database enum types. The values really in use are listed under each table and in the last section.
- Multi-value fields (attendees, line items, quotes, donor allocations, policy flags, the TDS split) are `jsonb` or text arrays on the row.
- Money is `numeric`. Dates are `timestamptz` unless noted. Primary keys are `uuid` unless noted.
- Row-level security is enabled on most tables but the policies are `USING (true)`: the app talks to the database straight from the browser with the anon key. See `SECURITY_AND_KNOWN_GAPS` in START_HERE.md.

## Tables

| Table | Rows | What it is |
|---|---|---|
| [activity_log](#activity_log) | 142 | What people did in the tool (approvals, submissions, rule changes). Admin-only to read. |
| [advances](#advances) | 5 | Money paid to an employee in advance, with its own approval and recorded status. |
| [approval_delegations](#approval_delegations) | 0 | Out-of-office cover: an approver names a teammate for a date range. |
| [approval_rules](#approval_rules) | 3 | Configurable report approval routes by amount range (levels, auto-approve, auto-reject). |
| [audit_trail_access_log](#audit_trail_access_log) | 9 | Who opened the PO audit trail and downloaded its bundle. |
| [custom_categories](#custom_categories) | 0 | Categories that grew out of "Other" automatically (see BUSINESS_RULES.md). |
| [expense_captures](#expense_captures) | 50 | The receipt image and payment proof as uploaded, with what OCR read from them (amounts, UPI details), a SHA-256 of the receipt for duplicate detection, and the AI-content flag. |
| [expense_details](#expense_details) | 2142 | One expense (about 70 columns): amounts, vendor, category, policy results, GST/TDS split, deductions, and links to its capture, report, PO and advances. |
| [expense_notifications](#expense_notifications) | 1514 | In-app notifications (the bell). |
| [expense_reports](#expense_reports) | 950 | A report: a bundle of expenses submitted for approval and payment, with status, route, net payable, advance applied, vouch and assignment fields. |
| [expense_vouch_events](#expense_vouch_events) | 7 | Finance line-by-line vouching history: clear, flag, query, reply, reopen. A line status is its latest event. |
| [feedback](#feedback) | 2 | Legacy table from the removed Share feedback widget. Kept; nothing writes to it. |
| [pr_approvals](#pr_approvals) | 85 | One row per approval level of a PR (Functional Leader, then PR Approver). |
| [pr_review_presence](#pr_review_presence) | 0 | Heartbeat so two approvers see that someone else is reviewing the same PR. |
| [purchase_orders](#purchase_orders) | 1041 | A PO created from an approved PR, approved and issued by Finance, with its PDF. |
| [purchase_requests](#purchase_requests) | 1051 | A purchase request: vendor, line items, quotes, budget, donor allocations, advance terms, status. |
| [report_advances](#report_advances) | 2 | How much of each advance a report used (a report can draw on several advances and the reverse). |
| [report_approvals](#report_approvals) | 52 | One row per approval level of a report: pending, waiting, approved or rejected. |
| [report_expenses](#report_expenses) | 1657 | Links a report to its expenses (many to many). |
| [system_logs](#system_logs) | 69 | Append-only record of changes to the system itself: schema changes, deployments, team changes, maintenance, downloads. Update, delete and truncate are refused. |
| [system_state](#system_state) | 2 | Key/value settings: the maintenance state, and the auto-category threshold. |
| [tds_rules](#tds_rules) | 6 | TDS rules owned by Finance: section, categories, payee type, rates, thresholds. |
| [team_members](#team_members) | 474 | Everyone who can sign in: name, email, role, function, and the switches for approving vendors and POs. Login is "type an authorised email", so this table IS the user list. |
| [vendor_bank_change_log](#vendor_bank_change_log) | 0 | Requested changes to a vendor bank account (old and new details). |
| [vendor_invites](#vendor_invites) | 24 | Public registration links for vendors, with token and expiry. |
| [vendors](#vendors) | 647 | Vendor master (about 60 columns): organisation, KYC, bank details, document paths, approval status. |
| [zoho_directory](#zoho_directory) | 1231 | Read-only copy of the employee directory (email, name, role, status), used for pickers and name lookups. |

### activity_log

What people did in the tool (approvals, submissions, rule changes). Admin-only to read.

12 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `entity_type` | text | no |  |
| `entity_id` | text | no |  |
| `entity_ref` | text | yes |  |
| `action` | text | no |  |
| `from_value` | text | yes |  |
| `to_value` | text | yes |  |
| `actor_email` | text | yes |  |
| `actor_name` | text | yes |  |
| `on_behalf_of` | text | yes |  |
| `note` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Indexes:

- `CREATE INDEX activity_log_created_idx ON public.activity_log USING btree (created_at DESC)`
- `CREATE INDEX activity_log_entity_idx ON public.activity_log USING btree (entity_type, entity_id)`

Row-level security: enabled. Policies: `activity_log_all` (all, using `true`).

Values in use:

- `entity_type`: `report` (91), `vendor` (14), `pr` (13), `settings` (11), `expense` (8), `po` (5)
- `action`: `status_change` (33), `level_approved` (24), `draft_deleted` (16), `resubmitted` (15), `draft_created` (11), `assigned` (8), `deleted` (8), `tds_rule_changed` (6), `tds_rule_added` (3), `vouch_clear` (3), `payment_kind_changed` (3), `vouch_reopen` (2), `submitted` (2), `approval_rule_toggled` (2), `confirmed_after_review` (1), `vouch_query` (1), `submitted_for_review` (1), `vouch_reply` (1), `created` (1), `tds_set` (1)

### advances

Money paid to an employee in advance, with its own approval and recorded status.

20 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `created_at` | timestamp with time zone | no | `now()` |
| `requested_by` | text | no |  |
| `amount` | numeric | no |  |
| `description` | text | no |  |
| `expected_usage_date` | date | no |  |
| `entity` | text | no |  |
| `program` | text | no |  |
| `stream` | text | yes |  |
| `advance_type` | text | no | `'Travel'::text` |
| `is_multi_individual` | boolean | no | `false` |
| `num_people` | integer | yes |  |
| `status` | text | no | `'pending_approval'::text` |
| `rejection_reason` | text | yes |  |
| `approved_by` | text | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `rejected_by` | text | yes |  |
| `rejected_at` | timestamp with time zone | yes |  |
| `recorded_by` | text | yes |  |
| `recorded_at` | timestamp with time zone | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Check: `CHECK (((amount > (0)::numeric) AND (amount <= (20000)::numeric)))`

Row-level security: enabled. Policies: `advances_all` (all, using `true`).

Values in use:

- `status`: `pending_approval` (3), `recorded` (2)
- `advance_type`: `Event` (4), `Travel` (1)

### approval_delegations

Out-of-office cover: an approver names a teammate for a date range.

12 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `delegator_email` | text | no |  |
| `delegator_name` | text | yes |  |
| `delegator_role` | text | no |  |
| `delegate_email` | text | no |  |
| `delegate_name` | text | yes |  |
| `start_date` | date | no |  |
| `end_date` | date | no |  |
| `note` | text | yes |  |
| `created_by` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `revoked_at` | timestamp with time zone | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Indexes:

- `CREATE INDEX approval_delegations_delegate_idx ON public.approval_delegations USING btree (lower(delegate_email))`

Row-level security: enabled. Policies: `approval_delegations_all` (all, using `true`).

### approval_rules

Configurable report approval routes by amount range (levels, auto-approve, auto-reject).

11 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | no | `identity (always)` |
| `name` | text | no |  |
| `description` | text | yes |  |
| `min_amount` | numeric | yes |  |
| `max_amount` | numeric | yes |  |
| `mode` | text | no | `'configure'::text` |
| `levels` | jsonb | no | `'[]'::jsonb` |
| `is_active` | boolean | no | `true` |
| `sort_order` | integer | no | `0` |
| `created_at` | timestamp with time zone | yes | `now()` |
| `updated_at` | timestamp with time zone | yes | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Row-level security: enabled. Policies: `approval_rules_all` (all, using `true`).

Values in use:

- `mode`: `configure` (3)

### audit_trail_access_log

Who opened the PO audit trail and downloaded its bundle.

5 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `accessed_by` | text | no |  |
| `po_id` | uuid | no |  |
| `action` | text | no |  |
| `created_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Row-level security: enabled. Policies: `audit_trail_access_log_all` (all, using `true`).

### custom_categories

Categories that grew out of "Other" automatically (see BUSINESS_RULES.md).

10 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `name` | text | no |  |
| `key` | text | no |  |
| `source` | text | no | `'auto'::text` |
| `times_seen` | integer | yes |  |
| `active` | boolean | no | `true` |
| `created_at` | timestamp with time zone | no | `now()` |
| `created_by` | text | yes |  |
| `changed_by` | text | yes |  |
| `changed_at` | timestamp with time zone | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (key)`

Row-level security: enabled. Policies: `custom_categories_all` (all, using `true`).

Values in use:

- `source`: 

### expense_captures

The receipt image and payment proof as uploaded, with what OCR read from them (amounts, UPI details), a SHA-256 of the receipt for duplicate detection, and the AI-content flag.

19 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `receipt_storage_path` | text | yes |  |
| `payment_storage_path` | text | yes |  |
| `receipt_extracted_amount` | numeric | yes |  |
| `receipt_extracted_vendor` | text | yes |  |
| `receipt_extracted_date` | text | yes |  |
| `payment_extracted_amount` | numeric | yes |  |
| `payment_extracted_transaction_id` | text | yes |  |
| `payment_is_upi` | boolean | yes |  |
| `payment_app` | text | yes |  |
| `amounts_match` | boolean | yes |  |
| `quality_override` | boolean | yes | `false` |
| `captured_offline` | boolean | yes | `false` |
| `single_document` | boolean | yes | `false` |
| `status` | text | yes | `'captured'::text` |
| `created_at` | timestamp with time zone | no | `now()` |
| `receipt_hash` | text | yes |  |
| `amount_choice` | text | yes |  |
| `ai_content_flag` | text | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Indexes:

- `CREATE INDEX expense_captures_receipt_hash_idx ON public.expense_captures USING btree (receipt_hash) WHERE (receipt_hash IS NOT NULL)`

Row-level security: enabled. Policies: `expense_captures_all` (all, using `true`).

### expense_details

One expense (about 70 columns): amounts, vendor, category, policy results, GST/TDS split, deductions, and links to its capture, report, PO and advances.

71 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `capture_id` | uuid | yes |  |
| `amount` | numeric | yes |  |
| `vendor` | text | yes |  |
| `date` | text | yes |  |
| `category` | text | yes |  |
| `expense_type` | text | yes |  |
| `attendee_count` | integer | yes |  |
| `per_person_amount` | numeric | yes |  |
| `attendee_names` | text | yes |  |
| `purpose_type` | text | yes |  |
| `description` | text | yes |  |
| `trip_related` | boolean | yes | `false` |
| `trip_name` | text | yes |  |
| `prior_approval_taken` | boolean | yes |  |
| `prior_approval_reference` | text | yes |  |
| `brand` | text | yes |  |
| `reimbursement_type` | text | yes |  |
| `payment_method` | text | yes |  |
| `status` | text | yes | `'saved'::text` |
| `submitted_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `policy_status` | text | yes |  |
| `policy_violations` | jsonb | yes |  |
| `policy_flags` | jsonb | yes |  |
| `approval_route` | text | yes |  |
| `invoice_number` | text | yes |  |
| `gstin` | text | yes |  |
| `user_id` | uuid | yes |  |
| `user_email` | text | yes |  |
| `vendor_id` | uuid | yes |  |
| `report_id` | uuid | yes |  |
| `entity` | text | yes |  |
| `program` | text | yes |  |
| `subprogram` | text | yes |  |
| `donor_name` | text | yes |  |
| `expense_nature` | text | yes |  |
| `reference_number` | text | yes |  |
| `card_no` | text | yes |  |
| `reimbursable` | boolean | yes | `true` |
| `po_number` | text | yes |  |
| `sub_category` | text | yes |  |
| `po_pdf_link` | text | yes |  |
| `paid_to` | text | yes |  |
| `vr_pdf_link` | text | yes |  |
| `sub_granting_category` | text | yes |  |
| `itemized_lines` | jsonb | yes |  |
| `supporting_attachments` | jsonb | yes |  |
| `attendees` | jsonb | yes |  |
| `er_pdf_link` | text | yes |  |
| `source_status` | text | yes |  |
| `po_payment_label` | text | yes |  |
| `deduction_amount` | numeric | yes |  |
| `deduction_reason` | text | yes |  |
| `deduction_note` | text | yes |  |
| `deducted_by` | text | yes |  |
| `deducted_at` | timestamp with time zone | yes |  |
| `base_amount` | numeric | yes |  |
| `gst_amount` | numeric | yes |  |
| `other_amount` | numeric | yes |  |
| `tds_status` | text | yes |  |
| `tds_section` | text | yes |  |
| `tds_rate` | numeric | yes |  |
| `tds_amount` | numeric | yes |  |
| `tds_note` | text | yes |  |
| `tds_set_by` | text | yes |  |
| `tds_set_at` | timestamp with time zone | yes |  |
| `policy_justification` | text | yes |  |
| `no_po_reason` | text | yes |  |
| `settle_advance_ids` | uuid[] | yes |  |
| `tds_breakdown` | jsonb | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Triggers:

- `CREATE TRIGGER promote_other_expense AFTER INSERT OR UPDATE OF category, sub_category, itemized_lines ON expense_details FOR EACH ROW EXECUTE FUNCTION trg_promote_other_expense()`
- `CREATE TRIGGER trg_company_card_not_reimbursable BEFORE INSERT OR UPDATE ON expense_details FOR EACH ROW EXECUTE FUNCTION enforce_company_card_not_reimbursable()`

Row-level security: enabled. Policies: `expense_details_all` (all, using `true`).

Values in use:

- `status`: `reported` (1656), `saved` (486)
- `policy_status`: `submitted` (1651), `(null)` (479), `blocked` (10), `pending` (2)
- `payment_method`: `(null)` (2093), `upi` (19), `Self - Cash/Card` (11), `Company Card` (8), `Self - UPI` (5), `Bank Transfer` (4), `Advance Adjustment` (1), `card` (1)
- `expense_type`: `just_me` (1657), `(null)` (471), `purchase_order_tranche` (8), `my_team` (6)
- `reimbursement_type`: `(null)` (2127), `bank_transfer` (12), `petty_cash` (3)
- `tds_status`: `(null)` (2141), `applicable` (1)
- `entity`: `Nudge Lifeskills Foundation` (1601), `Nudge Lifeskills Foundation - FCRA` (385), `AIC Developmental Foundation` (134), `(null)` (21), `TNF` (1)

### expense_notifications

In-app notifications (the bell).

9 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `recipient_id` | text | yes |  |
| `report_id` | uuid | yes |  |
| `type` | text | yes |  |
| `message` | text | yes |  |
| `is_read` | boolean | yes | `false` |
| `created_at` | timestamp with time zone | no | `now()` |
| `related_type` | text | yes |  |
| `related_id` | uuid | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Foreign key: `FOREIGN KEY (report_id) REFERENCES expense_reports(id) ON DELETE CASCADE`

Row-level security: enabled. Policies: `expense_notifications_all` (all, using `true`).

Values in use:

- `type`: `pr_pending_reminder` (1119), `pr_draft_reminder` (130), `pr_submitted` (129), `po_pending_review` (61), `pr_approved` (18), `approved` (17), `vendor_submitted` (12), `assigned` (8), `link_suggestion` (6), `vendor_approved` (5), `pr_raised` (2), `pr_rejected` (1), `pr_pending_review` (1), `vendor_raised` (1), `rejected` (1), `reply` (1), `vendor_rejected` (1), `query` (1)
- `related_type`: `pr` (1389), `po` (61), `report` (31), `vendor` (18), `(null)` (15)

### expense_reports

A report: a bundle of expenses submitted for approval and payment, with status, route, net payable, advance applied, vouch and assignment fields.

46 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `report_reference` | text | yes |  |
| `employee_id` | uuid | yes |  |
| `brand` | text | yes |  |
| `total_amount` | numeric | yes |  |
| `expense_count` | integer | yes |  |
| `approval_route` | text | yes |  |
| `status` | text | yes | `'submitted'::text` |
| `submitted_at` | timestamp with time zone | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `reimbursed_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `pdf_storage_path` | text | yes |  |
| `selected_expense_ids` | jsonb | yes |  |
| `approver_notes` | text | yes |  |
| `rejected_at` | timestamp with time zone | yes |  |
| `rejection_reason` | text | yes |  |
| `reviewed_by` | text | yes |  |
| `reviewed_at` | timestamp with time zone | yes |  |
| `vouched_at` | timestamp with time zone | yes |  |
| `vouched_by` | text | yes |  |
| `finance_notes` | text | yes |  |
| `employee_email` | text | yes |  |
| `pr_id` | uuid | yes |  |
| `link_confidence` | text | yes |  |
| `po_id` | uuid | yes |  |
| `business_purpose` | text | yes |  |
| `duration_start` | date | yes |  |
| `duration_end` | date | yes |  |
| `po_related` | boolean | yes |  |
| `purpose_type` | text | yes |  |
| `purpose_description` | text | yes |  |
| `advance_related` | boolean | yes |  |
| `advance_id` | uuid | yes |  |
| `ai_vouch_verdict` | text | yes |  |
| `ai_vouch_confidence` | text | yes |  |
| `ai_vouch_summary` | text | yes |  |
| `ai_vouch_checked_at` | timestamp with time zone | yes |  |
| `payment_kind` | text | yes |  |
| `assigned_to_email` | text | yes |  |
| `assigned_to_name` | text | yes |  |
| `assigned_at` | timestamp with time zone | yes |  |
| `net_payable` | numeric | yes |  |
| `advance_choice` | text | yes |  |
| `advance_choice_reason` | text | yes |  |
| `advance_applied` | numeric | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Foreign key: `FOREIGN KEY (advance_id) REFERENCES advances(id)`
- Foreign key: `FOREIGN KEY (po_id) REFERENCES purchase_orders(id)`
- Check: `CHECK ((NOT ((po_related IS TRUE) AND (advance_related IS TRUE))))`

Indexes:

- `CREATE INDEX expense_reports_assigned_idx ON public.expense_reports USING btree (assigned_to_email) WHERE (assigned_to_email IS NOT NULL)`

Row-level security: enabled. Policies: `expense_reports_all` (all, using `true`).

Values in use:

- `status`: `approved` (906), `draft` (34), `under_review` (8), `submitted` (1), `rejected` (1)
- `payment_kind`: `reimbursement` (803), `vendor` (147)
- `advance_choice`: `(null)` (950)

### expense_vouch_events

Finance line-by-line vouching history: clear, flag, query, reply, reopen. A line status is its latest event.

9 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `report_id` | uuid | no |  |
| `expense_id` | uuid | no |  |
| `kind` | text | no |  |
| `body` | text | yes |  |
| `author_email` | text | yes |  |
| `author_name` | text | yes |  |
| `author_role` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Check: `CHECK ((kind = ANY (ARRAY['clear'::text, 'flag'::text, 'query'::text, 'reply'::text, 'reopen'::text])))`

Indexes:

- `CREATE INDEX expense_vouch_events_report_idx ON public.expense_vouch_events USING btree (report_id, created_at)`
- `CREATE INDEX expense_vouch_events_expense_idx ON public.expense_vouch_events USING btree (expense_id, created_at)`

Row-level security: enabled. Policies: `expense_vouch_events_all` (all, using `true`).

Values in use:

- `kind`: `clear` (3), `reopen` (2), `reply` (1), `query` (1)

### feedback

Legacy table from the removed Share feedback widget. Kept; nothing writes to it.

16 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `created_at` | timestamp with time zone | no | `now()` |
| `category` | text | yes |  |
| `title` | text | yes |  |
| `description` | text | yes |  |
| `severity` | text | yes |  |
| `time_frame` | text | yes |  |
| `occurred_at` | timestamp with time zone | yes |  |
| `page_url` | text | yes |  |
| `module` | text | yes |  |
| `browser_info` | text | yes |  |
| `screen_resolution` | text | yes |  |
| `screenshot_path` | text | yes |  |
| `submitter_name` | text | yes |  |
| `submitter_email` | text | yes |  |
| `status` | text | yes | `'open'::text` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Row-level security: enabled. Policies: `feedback_all` (all, using `true`).

### pr_approvals

One row per approval level of a PR (Functional Leader, then PR Approver).

11 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `created_at` | timestamp with time zone | no | `now()` |
| `pr_id` | uuid | yes |  |
| `approver_level` | integer | yes |  |
| `approver_name` | text | yes |  |
| `approver_email` | text | yes |  |
| `status` | text | yes | `'waiting'::text` |
| `actioned_at` | timestamp with time zone | yes |  |
| `rejection_reason` | text | yes |  |
| `required_role` | text | yes |  |
| `required_approver_email` | text | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Foreign key: `FOREIGN KEY (pr_id) REFERENCES purchase_requests(id) ON DELETE CASCADE`

Row-level security: enabled. Policies: `pr_approvals_all` (all, using `true`).

Values in use:

- `status`: `approved` (76), `pending` (6), `waiting` (2), `rejected` (1)
- `required_role`: `fl` (37), `pr_approver` (37), `(null)` (11)

### pr_review_presence

Heartbeat so two approvers see that someone else is reviewing the same PR.

4 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `pr_id` | uuid | no |  |
| `viewer_email` | text | no |  |
| `viewer_name` | text | yes |  |
| `updated_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (pr_id, viewer_email)`
- Foreign key: `FOREIGN KEY (pr_id) REFERENCES purchase_requests(id) ON DELETE CASCADE`

Row-level security: enabled. Policies: `pr_review_presence_all` (all, using `true`).

### purchase_orders

A PO created from an approved PR, approved and issued by Finance, with its PDF.

13 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `created_at` | timestamp with time zone | no | `now()` |
| `po_number` | text | yes |  |
| `pr_id` | uuid | yes |  |
| `vendor_id` | uuid | yes |  |
| `amount` | numeric | yes |  |
| `entity` | text | yes |  |
| `status` | text | yes | `'pending_approval'::text` |
| `generated_at` | timestamp with time zone | yes | `now()` |
| `pdf_storage_path` | text | yes |  |
| `approved_by` | text | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `rejection_reason` | text | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (po_number)`
- Foreign key: `FOREIGN KEY (pr_id) REFERENCES purchase_requests(id)`
- Foreign key: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`

Row-level security: enabled. Policies: `purchase_orders_all` (all, using `true`).

Values in use:

- `status`: `issued` (650), `completed` (229), `rejected` (137), `cancelled` (22), `pending_approval` (3)

### purchase_requests

A purchase request: vendor, line items, quotes, budget, donor allocations, advance terms, status.

46 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `created_at` | timestamp with time zone | no | `now()` |
| `pr_number` | text | yes |  |
| `vendor_id` | uuid | yes |  |
| `requested_by` | text | yes |  |
| `amount` | numeric | yes |  |
| `base_amount` | numeric | yes |  |
| `tax_amount` | numeric | yes |  |
| `gst_amount` | numeric | yes |  |
| `incidental_amount` | numeric | yes |  |
| `budgeted` | boolean | yes |  |
| `category` | text | yes |  |
| `expense_type` | text | yes |  |
| `entity` | text | yes |  |
| `donor_name` | text | yes |  |
| `program` | text | yes |  |
| `subprogram` | text | yes |  |
| `donor_allocations` | jsonb | yes |  |
| `purpose` | text | yes |  |
| `is_recurring` | boolean | yes | `false` |
| `recurring_frequency` | text | yes |  |
| `quotes` | jsonb | yes |  |
| `quote_paths` | jsonb | yes |  |
| `single_source_justification` | text | yes |  |
| `comparative_statement_path` | text | yes |  |
| `advance_percent` | numeric | yes |  |
| `after_delivery_percent` | numeric | yes |  |
| `advance_fl_email_ack` | boolean | yes | `false` |
| `status` | text | yes | `'submitted'::text` |
| `submitted_at` | timestamp with time zone | yes |  |
| `ai_summary` | text | yes |  |
| `rejection_reason` | text | yes |  |
| `linked_expense_report_id` | uuid | yes |  |
| `link_confidence` | text | yes |  |
| `quantity` | numeric | yes |  |
| `rate_per_unit` | numeric | yes |  |
| `payment_terms` | text | yes |  |
| `credit_term_frequency` | text | yes |  |
| `credit_term_date` | date | yes |  |
| `from_date` | date | yes |  |
| `to_date` | date | yes |  |
| `advance_approval_screenshot_path` | text | yes |  |
| `rejected_at` | timestamp with time zone | yes |  |
| `last_reminder_at` | timestamp with time zone | yes |  |
| `line_items` | jsonb | yes |  |
| `source` | text | no | `'app'::text` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (pr_number)`
- Foreign key: `FOREIGN KEY (linked_expense_report_id) REFERENCES expense_reports(id)`
- Foreign key: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`

Triggers:

- `CREATE TRIGGER promote_other_pr AFTER INSERT OR UPDATE OF line_items, status ON purchase_requests FOR EACH ROW EXECUTE FUNCTION trg_promote_other_pr()`

Row-level security: enabled. Policies: `purchase_requests_all` (all, using `true`).

Values in use:

- `status`: `po_generated` (1034), `submitted` (6), `approved` (6), `draft` (4), `rejected` (1)
- `expense_type`: `Revenue Expenditure` (918), `Capital Expenditure (CAPEX)` (128), `Program Expenditure` (5)
- `source`: `app` (1050), `nucleus` (1)

### report_advances

How much of each advance a report used (a report can draw on several advances and the reverse).

5 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `report_id` | uuid | no |  |
| `advance_id` | uuid | no |  |
| `amount` | numeric | no |  |
| `created_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (report_id, advance_id)`
- Foreign key: `FOREIGN KEY (advance_id) REFERENCES advances(id)`
- Check: `CHECK ((amount >= (0)::numeric))`
- Foreign key: `FOREIGN KEY (report_id) REFERENCES expense_reports(id) ON DELETE CASCADE`

Indexes:

- `CREATE INDEX report_advances_advance_idx ON public.report_advances USING btree (advance_id)`

Row-level security: enabled. Policies: `report_advances_all` (all, using `true`).

### report_approvals

One row per approval level of a report: pending, waiting, approved or rejected.

11 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `report_id` | uuid | yes |  |
| `approver_level` | text | yes |  |
| `approver_name` | text | yes |  |
| `approver_email` | text | yes |  |
| `status` | text | yes | `'waiting'::text` |
| `notes` | text | yes |  |
| `actioned_at` | timestamp with time zone | yes |  |
| `due_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `required_role` | text | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (report_id, approver_level)`
- Foreign key: `FOREIGN KEY (report_id) REFERENCES expense_reports(id) ON DELETE CASCADE`

Row-level security: enabled. Policies: `report_approvals_all` (all, using `true`).

Values in use:

- `status`: `approved` (40), `pending` (9), `waiting` (2), `rejected` (1)
- `required_role`: `(null)` (37), `finance` (11), `fl` (3), `coo` (1)

### report_expenses

Links a report to its expenses (many to many).

4 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `report_id` | uuid | yes |  |
| `expense_id` | uuid | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Foreign key: `FOREIGN KEY (expense_id) REFERENCES expense_details(id) ON DELETE CASCADE`
- Foreign key: `FOREIGN KEY (report_id) REFERENCES expense_reports(id) ON DELETE CASCADE`

Row-level security: enabled. Policies: `report_expenses_all` (all, using `true`).

### system_logs

Append-only record of changes to the system itself: schema changes, deployments, team changes, maintenance, downloads. Update, delete and truncate are refused.

11 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `created_at` | timestamp with time zone | no | `now()` |
| `category` | text | no |  |
| `action` | text | no |  |
| `target` | text | yes |  |
| `detail` | text | yes |  |
| `actor_email` | text | yes |  |
| `actor_name` | text | yes |  |
| `source` | text | no | `'app'::text` |
| `ref` | text | yes |  |
| `meta` | jsonb | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`

Indexes:

- `CREATE INDEX system_logs_created_idx ON public.system_logs USING btree (created_at DESC)`
- `CREATE INDEX system_logs_category_idx ON public.system_logs USING btree (category, created_at DESC)`
- `CREATE UNIQUE INDEX system_logs_ref_uidx ON public.system_logs USING btree (category, ref) WHERE (ref IS NOT NULL)`

Triggers:

- `CREATE TRIGGER system_logs_no_change BEFORE DELETE OR UPDATE ON system_logs FOR EACH ROW EXECUTE FUNCTION system_logs_refuse()`
- `CREATE TRIGGER system_logs_no_truncate BEFORE TRUNCATE ON system_logs FOR EACH STATEMENT EXECUTE FUNCTION system_logs_refuse()`

Row-level security: enabled. Policies: `system_logs_add` (insert, using `true`); `system_logs_read` (select, using `true`).

Values in use:

- `category`: `team` (30), `schema` (21), `deployment` (17), `download` (1)
- `action`: `deployed` (17), `member_updated` (16), `role_changed` (13), `CREATE FUNCTION` (9), `CREATE INDEX` (3), `ALTER TABLE` (3), `CREATE TRIGGER` (2), `CREATE POLICY` (2), `CREATE TABLE` (1), `po_approval_switched_on` (1), `DROP INDEX` (1), `audit_pack_download` (1)

### system_state

Key/value settings: the maintenance state, and the auto-category threshold.

4 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text | no |  |
| `value` | jsonb | no | `'{}'::jsonb` |
| `updated_at` | timestamp with time zone | no | `now()` |
| `updated_by` | text | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (key)`

Row-level security: enabled. Policies: `system_state_all` (all, using `true`).

### tds_rules

TDS rules owned by Finance: section, categories, payee type, rates, thresholds.

13 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `section` | text | no |  |
| `label` | text | no |  |
| `categories` | text[] | no | `'{}'::text[]` |
| `payee_type` | text | no | `'any'::text` |
| `rate` | numeric | no |  |
| `no_pan_rate` | numeric | no | `20` |
| `single_threshold` | numeric | yes |  |
| `annual_threshold` | numeric | yes |  |
| `active` | boolean | no | `true` |
| `source` | text | no | `'custom'::text` |
| `notes` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Check: `CHECK ((payee_type = ANY (ARRAY['any'::text, 'individual'::text, 'other'::text])))`

Row-level security: enabled. Policies: `tds_rules_all` (all, using `true`).

Values in use:

- `payee_type`: `any` (4), `individual` (1), `other` (1)

### team_members

Everyone who can sign in: name, email, role, function, and the switches for approving vendors and POs. Login is "type an authorised email", so this table IS the user list.

12 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `name` | text | no |  |
| `email` | text | no |  |
| `role` | text | no |  |
| `can_approve_vendors` | boolean | yes | `false` |
| `created_at` | timestamp with time zone | no | `now()` |
| `analytics_reset_at` | timestamp with time zone | yes |  |
| `function` | text | yes |  |
| `linked_email` | text | yes |  |
| `changed_by` | text | yes |  |
| `changed_at` | timestamp with time zone | yes |  |
| `can_approve_pos` | boolean | no | `false` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (email)`

Triggers:

- `CREATE TRIGGER team_members_system_log AFTER INSERT OR DELETE OR UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION log_team_member_change()`

Row-level security: enabled. Policies: `team_members_all` (all, using `true`).

Values in use:

- `role`: `employee` (452), `finance` (10), `fl` (8), `admin` (2), `finance_admin` (1), `super_fl` (1)
- `function`: `(null)` (473), `Central Strategy & Operations` (1)

### vendor_bank_change_log

Requested changes to a vendor bank account (old and new details).

11 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `vendor_id` | uuid | yes |  |
| `requested_by` | text | yes |  |
| `old_account_number` | text | yes |  |
| `new_account_number` | text | yes |  |
| `old_ifsc_code` | text | yes |  |
| `new_ifsc_code` | text | yes |  |
| `old_bank_name` | text | yes |  |
| `new_bank_name` | text | yes |  |
| `status` | text | yes | `'pending'::text` |
| `created_at` | timestamp with time zone | no | `now()` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Foreign key: `FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE`

Row-level security: enabled. Policies: `vendor_bank_change_log_all` (all, using `true`).

### vendor_invites

Public registration links for vendors, with token and expiry.

8 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | no | `identity (always)` |
| `token` | text | no |  |
| `created_by_email` | text | no |  |
| `created_by_name` | text | yes |  |
| `created_at` | timestamp with time zone | yes | `now()` |
| `expires_at` | timestamp with time zone | no |  |
| `used_at` | timestamp with time zone | yes |  |
| `vendor_id` | uuid | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (token)`
- Foreign key: `FOREIGN KEY (vendor_id) REFERENCES vendors(id)`

Row-level security: enabled. Policies: `vendor_invites_all` (all, using `true`).

### vendors

Vendor master (about 60 columns): organisation, KYC, bank details, document paths, approval status.

60 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `vendor_id` | text | yes |  |
| `org_name` | text | yes |  |
| `pan_number` | text | yes |  |
| `gstin` | text | yes |  |
| `email` | text | yes |  |
| `phone` | text | yes |  |
| `address` | text | yes |  |
| `city` | text | yes |  |
| `state` | text | yes |  |
| `pincode` | text | yes |  |
| `bank_name` | text | yes |  |
| `account_number` | text | yes |  |
| `ifsc_code` | text | yes |  |
| `account_holder_name` | text | yes |  |
| `cancelled_cheque_url` | text | yes |  |
| `pan_document_url` | text | yes |  |
| `status` | text | yes | `'pending'::text` |
| `submitted_by` | text | yes |  |
| `submitted_at` | timestamp with time zone | yes | `now()` |
| `approved_by` | text | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `rejection_reason` | text | yes |  |
| `notes` | text | yes |  |
| `org_type` | text | yes |  |
| `contact_person` | text | yes |  |
| `website` | text | yes |  |
| `address_line1` | text | yes |  |
| `address_line2` | text | yes |  |
| `country` | text | yes | `'India'::text` |
| `date_of_incorporation` | date | yes |  |
| `org_registration_number` | text | yes |  |
| `org_registration_state` | text | yes |  |
| `is_msme` | boolean | yes | `false` |
| `is_gstin_registered` | boolean | yes | `false` |
| `beneficiary_name` | text | yes |  |
| `branch` | text | yes |  |
| `cancelled_cheque_path` | text | yes |  |
| `pan_copy_path` | text | yes |  |
| `msme_details` | text | yes |  |
| `msme_certificate_path` | text | yes |  |
| `gst_certificate_path` | text | yes |  |
| `registration_certificate_path` | text | yes |  |
| `aadhaar_number` | text | yes |  |
| `aadhaar_copy_path` | text | yes |  |
| `aadhaar_pan_linked` | boolean | yes | `false` |
| `aadhaar_pan_link_proof_path` | text | yes |  |
| `is_related_to_org` | boolean | yes |  |
| `related_org_description` | text | yes |  |
| `nature_of_business` | text | yes |  |
| `created_at` | timestamp with time zone | yes | `now()` |
| `rejected_at` | timestamp with time zone | yes |  |
| `rejected_by` | text | yes |  |
| `cancelled_cheque_drive_link` | text | yes |  |
| `pan_copy_drive_link` | text | yes |  |
| `registration_certificate_drive_link` | text | yes |  |
| `gst_certificate_drive_link` | text | yes |  |
| `msme_certificate_drive_link` | text | yes |  |
| `drive_folder_link` | text | yes |  |
| `source` | text | no | `'app'::text` |

Keys and constraints:

- Primary key: `PRIMARY KEY (id)`
- Unique: `UNIQUE (vendor_id)`

Row-level security: enabled. Policies: `vendors_all` (all, using `true`).

Values in use:

- `status`: `approved` (636), `draft` (8), `pending` (2), `rejected` (1)
- `org_type`: `Private Limited` (231), `Individual/Freelancer` (125), `Proprietorship` (121), `LLP` (63), `Public Limited` (22), `Section 8 Company` (20), `(null)` (18), `Trust/NGO` (16), `Co-operative Society / AOP / SHG` (15), `Government Entity` (13), `Other` (3)
- `source`: `app` (647)

### zoho_directory

Read-only copy of the employee directory (email, name, role, status), used for pickers and name lookups.

4 columns.

| Column | Type | Null | Default |
|---|---|---|---|
| `email` | text | no |  |
| `name` | text | no |  |
| `role` | text | yes |  |
| `status` | text | yes |  |

Keys and constraints:

- Primary key: `PRIMARY KEY (email)`

Row-level security: enabled. Policies: `zoho_directory_all` (all, using `true`).

## Database functions and triggers

- `category_key()`: Normalises text so "Stage hires" and "stage-hire" are the same key (also ignores "and").
- `enforce_company_card_not_reimbursable()`: Trigger on expense_details: an expense paid on a company card cannot be reimbursable.
- `jsonb_arr()`: Returns a jsonb array, or an empty array if the value is not one.
- `log_ddl_command()`: Event trigger: records every schema change in public into System Logs.
- `log_ddl_drop()`: Event trigger: records every drop in public into System Logs.
- `log_team_member_change()`: Trigger on team_members: writes a System Log row when someone is added, removed or changed.
- `next_doc_number()`: Issues PR, PO and VR numbers: one counter per kind per fiscal year (SECURITY DEFINER, advisory lock).
- `promote_other_category()`: Counts what is typed under Other and creates a category when it is frequent enough.
- `system_logs_refuse()`: Triggers on system_logs: refuse update, delete and truncate.
- `trg_promote_other_expense()`: Trigger on expense_details: calls promote_other_category.
- `trg_promote_other_pr()`: Trigger on purchase_requests: calls promote_other_category for PR line items.

Full bodies are in `docs/database/schema.sql`. Event triggers (`system_log_ddl`, `system_log_drop`) are in `docs/database/event_triggers.sql` and must be applied last, after the data load.

## Document numbering

PR, PO and vendor registration numbers look like `26/27-PR-07-0053`: fiscal year, kind (`PR`, `PO`, `VR`), a fixed `07` segment, a 4-digit counter. `next_doc_number(kind, fy_prefix)` creates one sequence per kind per fiscal year on first use (`doc_seq_pr_26_27` and so on), seeded from the rows already numbered that year, and is safe under concurrent use. Report references are `TNIE<yy>####` (employee reimbursement) and `TNIV<yy>####` (vendor invoice against a PO), generated in the browser.

## Storage buckets

All private; files are opened through signed URLs. The database stores the paths, so paths must not change in a move.

| Bucket | Public | Files | Size | Used for |
|---|---|---|---|---|
| expense-documents | no | 62 | 11.8 MB | Receipts, payment proofs, supporting attachments |
| feedback-screenshots | no | 2 | 0.4 MB | Legacy, unused |
| po-pdfs | no | 380 | 70.9 MB | Generated PO PDFs |
| pr-quotes | no | 128 | 41.3 MB | Quotes, comparative statements, advance approval screenshots |
| vendor-documents | no | 194 | 60.3 MB | PAN, cheque, GST, MSME, registration, Aadhaar documents |

The code also refers to an `expense-reports` bucket (report PDFs) that has never existed on the live project, so those uploads fail quietly and report PDFs are generated on the fly. See `scripts/migration/inventory.json`, `known_gaps`.

## Where each text "enum" is defined in code

| Value list | File |
|---|---|
| Roles | `src/lib/auth.js` (`ROLES`) |
| Expense categories | `src/lib/expenseCategories.js`, `src/lib/prConstants.js`, and `custom_categories` |
| Stages and statuses | the components that set them; see WORKFLOWS.md |
| Entities, programmes, sub-programmes, donors | `src/lib/donorData.js` (generated from the mapping sheet) |
| Functions (PR routing) | `src/lib/functionRouting.js` |
| Expense natures | `src/lib/donorData.js` (`EXPENSE_NATURES`) |
