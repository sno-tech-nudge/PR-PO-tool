import { supabase } from './supabase'

// ─── Roles ─────────────────────────────────────────────────────────────────
// Backed by the team_members table (admin-managed via the Settings screen)
// instead of a hardcoded map — see src/components/settings/SettingsView.jsx.
// No passwords: access is still just "type an authorised email," identical
// trust model to before, now editable by an admin instead of a developer.
export const ROLES = ['employee', 'fl', 'admin', 'finance', 'pr_approver', 'observer']

const ROLE_LABEL = {
  employee:    'Employee',
  fl:          'Functional Leader',
  admin:       'Admin',
  finance:     'Finance Team',
  pr_approver: 'PR Approver',
  observer:    'Observer',
}

const SESSION_KEY = 'nudge_user_email'

export function getRoleLabel(role) {
  return ROLE_LABEL[role] || role
}

function buildUser(row) {
  return {
    id:                  row.email,
    email:               row.email,
    role:                row.role,
    name:                row.name,
    roleLabel:           getRoleLabel(row.role),
    can_approve_vendors: !!row.can_approve_vendors,
  }
}

async function lookupMember(email) {
  const normalized = email?.toLowerCase()?.trim()
  if (!normalized) return null
  const { data } = await supabase
    .from('team_members')
    .select('name, email, role, can_approve_vendors')
    .ilike('email', normalized)
    .maybeSingle()
  return data || null
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

// ─── Permission helpers ──────────────────────────────────────────────────
// admin bypasses every restriction below — "admin has both finance & employee
// view... can access & do anything."
export const canAccessFinance   = (role) => role === 'admin' || role === 'finance'
export const canAccessApprovals = (role) => role === 'admin' || role === 'finance' || role === 'fl' || role === 'pr_approver'
export const isObserver         = (role) => role === 'observer'

// The one fine-grained guardrail explicitly requested: within Finance,
// only members individually flagged can approve/reject vendors — everyone
// else (including other finance members) can only view.
export const canApproveVendor = (user) =>
  !!user && (user.role === 'admin' || (user.role === 'finance' && user.can_approve_vendors))

// Raising a PR is a requester action — people who sit somewhere in the
// approval chain (fl, pr_approver, finance/PO approver) shouldn't also be
// able to submit requests for themselves to approve. Employees always can;
// admin always can, per "admin can access & do anything."
export const canCreatePR = (role) => role === 'admin' || role === 'employee'
