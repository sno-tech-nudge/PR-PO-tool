# Roles and permissions

Source of truth in code: `src/lib/auth.js` (helpers) and the checks in each screen. Roles live in `team_members.role` (plain text, **no database constraint**).
**Every restriction below is enforced in the browser only.** The database lets anyone holding the public key read and write every table
(see `DATA_MODEL.md`, "policies"). A rebuild should enforce these on the server or in database policies.

## Sign-in

No passwords. A person types their work email; the app looks it up in `team_members` (case-insensitive). Not found → "This email is not authorised. Contact your administrator."
Found → the lowercased email is stored in `localStorage` (`nudge_user_email`) and re-checked against the table on every load (so removing a person logs them out).
A person with two accounts (a `thenudge.org` one and a `thedelta.org.in` one) can have them tied through `linked_email`; every "is this mine" check uses
`isOwnEmail`, which accepts either. The session user object carries: email, name, role, `can_approve_vendors`, `can_approve_pos`, `function`, `ownEmails`.

## The roles

| Role | Label | In short |
|---|---|---|
| `employee` | Employee | Raises expenses, reports, advances, PRs. Sees only their own records |
| `fl` | Functional Leader | Approves reports above the threshold and PRs for their function. Does not raise PRs |
| `super_fl` | Super FL | Everything an FL does, and can act on the FL level of **any** PR whichever FL it was routed to |
| `pr_approver` | PR Approver | Second and final approver of purchase requests. Does not raise PRs |
| `finance` | Finance Team | Reviews and vouches reports, pays, manages vendors/POs/TDS, with two individual switches (below) |
| `finance_admin` | Finance Admin | An admin's power over Finance work and Settings, but not the logs, not editing people, not maintenance mode |
| `admin` | Admin | Full access, the only role that sees logs, edits people and runs maintenance mode |
| `coo` | COO | **Retired.** Still a valid role value; some old approval rows and one active rule reference it |
| `observer` | Observer | Read-only |

Two per-person switches on `finance` members (set in Settings, Team & Roles; reset to false if the role changes):

- `can_approve_vendors`: may approve or reject vendors.
- `can_approve_pos`: may approve and issue purchase orders.

`team_members.function` (one of the 17 functions in `functionRouting.js`) says which Functional Leader approves that person's PRs. `department` is not stored; it is derived from the email domain.

## Helper rules (`src/lib/auth.js`)

| Helper | True for |
|---|---|
| `canAccessFinance` | admin, finance_admin, finance |
| `canAccessApprovals` | admin, finance_admin, finance, fl, super_fl, pr_approver, coo |
| `isAdminLike` | admin, finance_admin |
| `canOverrideApprovals` | finance_admin only |
| `isOwnOverride(user, requester)` | finance_admin acting on something they raised themselves |
| `canApproveVendor` | admin, finance_admin, or a `finance` member with `can_approve_vendors` |
| `canApprovePO` | finance_admin, or a `finance` member with `can_approve_pos` |
| `canCreatePR` | admin, finance_admin, employee |
| `isObserver` | observer |

## Navigation by role (`src/App.jsx`)

| Tab | Shown to |
|---|---|
| Home | everyone |
| My Expenses | everyone except `finance` |
| Approvals (and History) | roles with approvals access get "Approvals & History" (finance gets Approvals only); `observer` gets History only; `employee` has neither tab |
| Finance | admin, finance_admin, finance |
| Advances, Purchase Requests, Purchase Orders | everyone (contents scoped, see below) |
| Vendors / Vendor Management | everyone; "Vendor Management" label for finance-access roles |
| Logs (Activity Log, System Logs, audit pack) | **admin only** |
| Settings | everyone (employees see their own profile; Team & Roles for admin-like) |

While **maintenance mode** is active every role except `admin` sees only the maintenance page.

## What each role can do, by record

### Reports (expense reports)

- **Raise, edit, submit, delete drafts:** the owner. `finance` does not raise reports.
- **Approve or reject a level:** a level is actionable **only by the role named on it** (`report_approvals.required_role`). A level with no required role ("Reporting Manager")
  can be acted on by any role with approvals access. **Not even admin acts on a level reserved for another role.** Exceptions: `finance_admin` can act at any level but never on their own report; a **delegate**
  covering an absent approver can act on that approver's role level (the trail records "on behalf of").
- **Finance step:** shows the line-by-line vouching view. Finance (and admin-like) can vouch, flag, query, deduct, switch payment kind, override TDS, assign to a teammate, mark reimbursed, export to Tally.
- **View:** employees only their own; Finance sees all; admin all; observer all read-only.

### Purchase requests

- **Raise:** employee, admin, finance_admin only. FL, PR approver and Finance never raise PRs for themselves to approve.
- **Level 1 (Functional Leader):** pinned to the person resolved from the requester's function (`required_approver_email`) if one exists, else any `fl`. `super_fl` can always act at this level.
- **Level 2 (PR Approver):** role `pr_approver`.
- **Finance Admin:** any level, never their own request. **Delegates** per the delegation rule.
- **View:** employees only their own PRs; others per approvals access.
- **Create a PO** from an approved PR: finance-access roles.

### Purchase orders

- **View:** employees only POs on their own PRs; Finance and admin-like all.
- **Approve/issue or reject:** `finance` with `can_approve_pos`, or `finance_admin` (not for their own request), or a delegate of such a Finance member. Plain `finance` without the switch can view but not approve. `admin` is **not** in this list.
- **Complete or cancel an issued PO, see advance TDS:** finance-access roles.
- **Audit trail (PO document chain):** admin-like.

### Vendors

- **Create/register:** any signed-in person (and the public invite link, no login).
- **View:** everyone.
- **Approve or reject:** `canApproveVendor`, and never the person's own submission if they are Finance Admin.
- **Bank change request:** raised from the vendor page (`BankChangeRequest.jsx`); old and new details are kept in `vendor_bank_change_log`. Check the component for who may raise it before copying the rule.

### Advances

- **Request:** any person, for themselves. They see only their own.
- **Approve or reject:** the advance approval screen has **no role check of its own**: anyone who can open the Approvals tab (any role with approvals access) can decide. Finance Admin cannot decide their own. Treat this as a gap to close when rebuilding, or confirm it is intended.
- **Record the payout** and see the ledger: finance-access roles.

### Settings and control

| Area | admin | finance_admin | others |
|---|---|---|---|
| Team & Roles (add, edit, remove, role change, switches) | yes | **view only**, and only `finance`, `pr_approver`, `fl`, `super_fl` people | own profile |
| Approval rules, TDS rules, Categories | yes | yes | no |
| Delegations | not delegable | not delegable | delegatable roles (below) set their own |
| Activity Log, System Logs, audit pack | yes | **no** | no |
| Maintenance mode | yes | no (treated as an ordinary user while it is on) | no |

Delegatable roles: `fl`, `super_fl`, `pr_approver`, `coo`, `finance`. `admin` and `finance_admin` access is never delegable.

## Delegation

A person names a teammate for a date range (`approval_delegations`: delegator, delegate, role, start, end, `revoked_at`). While today is inside the window and not revoked, the delegate:

- can act on any approval level whose role equals the delegator's role (role-only levels), or whose pinned approver is the delegator (PR Functional Leader level);
- receives the "action needed" notifications for that level;
- is recorded in the trail as acting on behalf of the delegator. A real approver is never logged "on behalf of" anyone.

## Notifications by role

In-app (`expense_notifications`, bell) and email go to whoever can act on the item; see `WORKFLOWS.md`. Finance Admin currently receives **none** (known gap).

## Deliberate restrictions to keep

- Raising a PR is for requesters only; approvers never raise their own.
- Each approval level belongs to its role; nobody, admin included, acts out of turn (except Finance Admin and delegates as above).
- Finance Admin never approves what they raised.
- PO approval and vendor approval are per-person switches, not blanket Finance powers.
- Logs and adding or editing people are admin only.
- Observers can only look.

## When you rebuild

Put these in the server: database row-level policies or an API layer keyed to a real authenticated identity, using the table above. The matrix of "who can act on which level" is business policy and must be reproduced exactly.
