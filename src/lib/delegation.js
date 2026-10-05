import { supabase } from './supabase'

// Roles that can hand off their approvals. Admin is deliberately excluded —
// admin access is never delegable.
export const DELEGATABLE_ROLES = ['fl', 'super_fl', 'pr_approver', 'coo', 'finance']

function todayStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Delegations currently covering this user: they are the delegate, today
// falls inside the window, and it hasn't been revoked. Never throws — a
// lookup failure just means "no delegations," i.e. today's behavior.
export async function getActiveDelegationsForDelegate(user) {
  const emails = user?.ownEmails || []
  if (emails.length === 0) return []
  const today = todayStr()
  const { data, error } = await supabase
    .from('approval_delegations')
    .select('id, delegator_email, delegator_name, delegator_role, start_date, end_date')
    .in('delegate_email', emails)
    .is('revoked_at', null)
    .lte('start_date', today)
    .gte('end_date', today)
  if (error) { console.error('delegation lookup failed:', error.message); return [] }
  return data || []
}

// Does any active delegation let this user act on an approval level?
// Email-pinned levels (PR Functional Leader) match on the delegator's email;
// role-only levels match on the delegator's role.
export function delegationCovers(delegations, { requiredRole, requiredApproverEmail }) {
  return (delegations || []).find(d => {
    if (requiredApproverEmail) return d.delegator_email.toLowerCase() === String(requiredApproverEmail).toLowerCase()
    if (requiredRole) return d.delegator_role === requiredRole
    return false
  }) || null
}
