import { supabase } from './supabase'

// ─── Roles ─────────────────────────────────────────────────────────────────
// Backed by the team_members table (admin-managed via the Settings screen)
// instead of a hardcoded map — see src/components/settings/SettingsView.jsx.
// No passwords: access is still just "type an authorised email," identical
// trust model to before, now editable by an admin instead of a developer.
export const ROLES = ['employee', 'fl', 'super_fl', 'admin', 'finance_admin', 'finance', 'pr_approver', 'coo', 'observer']

const ROLE_LABEL = {
  employee:    'Employee',
  fl:          'Functional Leader',
  super_fl:    'Super FL',
  admin:       'Admin',
  finance_admin: 'Finance Admin',
  finance:     'Finance Team',
  pr_approver: 'PR Approver',
  coo:         'COO',
  observer:    'Observer',
}

const SESSION_KEY = 'nudge_user_email'

export function getRoleLabel(role) {
  return ROLE_LABEL[role] || role
}

function buildUser(row) {
  // Almost always just [their own email] — only non-trivial for the
  // handful of people who have two separate logins for the same real human
  // (e.g. a thenudge.org account and a thedelta.org.in account) and have
  // been explicitly linked via team_members.linked_email. Use this (not
  // .email) for anything that decides "is this my own record" — see
  // isOwnEmail below.
  const ownEmails = [row.email, row.linked_email].filter(Boolean).map(e => e.toLowerCase())
  return {
    id:                  row.email,
    email:               row.email,
    role:                row.role,
    name:                row.name,
    roleLabel:           getRoleLabel(row.role),
    can_approve_vendors: !!row.can_approve_vendors,
    can_approve_pos:     !!row.can_approve_pos,
    function:            row.function || null,
    ownEmails,
  }
}

async function lookupMember(email) {
  const normalized = email?.toLowerCase()?.trim()
  if (!normalized) return null
  const { data } = await supabase
    .from('team_members')
    .select('name, email, role, can_approve_vendors, can_approve_pos, function, linked_email')
    .ilike('email', normalized)
    .maybeSingle()
  return data || null
}

// Centralizes "does this email belong to the current user" — covers the
// (usual) single-identity case and the linked-account case identically, so
// every ownership check in the app uses the same rule instead of each
// reimplementing `=== user.email`.
export function isOwnEmail(user, email) {
  return !!email && (user?.ownEmails || []).includes(String(email).toLowerCase())
}

export async function signIn(email) {
  const normalized = email.toLowerCase().trim()
  const row = await lookupMember(normalized)
  if (!row) {
    return { error: 'This email is not authorised. Contact your administrator.' }
  }
  localStorage.setItem(SESSION_KEY, normalized)
  return { user: buildUser(row) }
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
}

export async function getSession() {
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return null
  const row = await lookupMember(email)
  if (!row) { signOut(); return null } // account removed since last login
  return buildUser(row)
}

export async function getFinanceEmails() {
  const { data } = await supabase.from('team_members').select('email').eq('role', 'finance')
  return (data || []).map(r => r.email)
}

// Every team member holding a given role — used to notify a whole approval
// step (e.g. all 'fl' members) rather than one hardcoded address.
export async function getEmailsByRole(role) {
  const { data } = await supabase.from('team_members').select('email').eq('role', role)
  return (data || []).map(r => r.email)
}

// Who to email for an "action needed" notice at a given report_approvals/
// pr_approvals level. A specific required_role (fl/coo/pr_approver/finance)
// targets just that role; the coarse "Reporting Manager" level has no 1:1
// role (required_role: null), so it falls back to everyone canAccessApprovals
// already lets act there — the email reaches exactly who can actually act.
export async function getApproverEmailsForLevel(requiredRole) {
  if (requiredRole) return getEmailsByRole(requiredRole)
  const { data } = await supabase.from('team_members').select('email').in('role', ['admin', 'finance_admin', 'finance', 'fl', 'super_fl', 'pr_approver', 'coo'])
  return (data || []).map(r => r.email)
}

// ─── Permission helpers ──────────────────────────────────────────────────
// admin bypasses every restriction below — "admin has both finance & employee
// view... can access & do anything."
export const canAccessFinance   = (role) => role === 'admin' || role === 'finance_admin' || role === 'finance'
export const canAccessApprovals = (role) => role === 'admin' || role === 'finance_admin' || role === 'finance' || role === 'fl' || role === 'super_fl' || role === 'pr_approver' || role === 'coo'
export const isObserver         = (role) => role === 'observer'

// Finance Admin has an admin's powers over Finance work and Settings, but not the logs
// (Activity Log, System Logs, audit pack) and not the team list: they can only see who
// holds the finance, PR approver and Functional Leader roles, and cannot change anyone.
// Use this wherever "admin" means "can run Finance and Settings"; keep `role === 'admin'`
// for the logs, adding or editing people, and maintenance mode.
export const isAdminLike = (role) => role === 'admin' || role === 'finance_admin'
export const FINANCE_ADMIN_VISIBLE_ROLES = ['finance', 'pr_approver', 'fl', 'super_fl']

// Unlike every other role, Finance Admin can approve or reject at ANY level of a report,
// purchase request, purchase order, vendor or advance, not only the level held. It can
// never act on something it raised itself (see isOwnOverride).
export const canOverrideApprovals = (role) => role === 'finance_admin'
export const isOwnOverride = (user, requesterEmail) => canOverrideApprovals(user?.role) && isOwnEmail(user, requesterEmail)

// The one fine-grained guardrail explicitly requested: within Finance,
// only members individually flagged can approve/reject vendors — everyone
// else (including other finance members) can only view.
export const canApproveVendor = (user) =>
  !!user && (user.role === 'admin' || user.role === 'finance_admin' || (user.role === 'finance' && user.can_approve_vendors))

// The two organisations the team belongs to, told apart by email domain (there is no department column).
export const DEPARTMENTS = [
  { key: 'nudge', label: 'The Nudge', domain: 'thenudge.org' },
  { key: 'delta', label: 'The Delta', domain: 'thedelta.org.in' },
]
export const departmentOf = (email) => {
  const domain = String(email || '').toLowerCase().split('@')[1] || ''
  return DEPARTMENTS.find(d => d.domain === domain)?.key || null
}

// Approving or rejecting purchase orders: each Finance team member has a switch (can_approve_pos) that an
// admin sets in Settings, Team & Roles. Finance Admin can always (but not for a request they raised: see PODetail).
export const canApprovePO = (user) =>
  !!user && (user.role === 'finance_admin' || (user.role === 'finance' && !!user.can_approve_pos))

// Raising a PR is a requester action — people who sit somewhere in the
// approval chain (fl, pr_approver, finance/PO approver) shouldn't also be
// able to submit requests for themselves to approve. Employees always can;
// admin always can, per "admin can access & do anything."
export const canCreatePR = (role) => role === 'admin' || role === 'finance_admin' || role === 'employee'
