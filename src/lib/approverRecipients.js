import { supabase } from './supabase'
import { getEmailsByRole } from './auth'

function todayStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Everyone who should be told that an approval level needs action:
//  - the ONE resolved approver when the level is pinned to an email (PR
//    Functional Leader for the requester's Function), otherwise everyone
//    holding the level's role;
//  - Super FL as well for the Functional Leader level, since a Super FL can
//    act on the FL level of any PR (PRDetail.jsx) but isn't a plain 'fl';
//  - anyone currently covering for the approver via an out-of-office
//    delegation (src/lib/delegation.js).
// De-duplicated case-insensitively. Never throws — an empty list just means
// nobody gets told, which is no worse than before.
export async function getApprovalLevelRecipients({ requiredRole, requiredApproverEmail }) {
  try {
    const base = requiredApproverEmail
      ? [requiredApproverEmail]
      : requiredRole ? await getEmailsByRole(requiredRole) : []
    const superFl = requiredRole === 'fl' ? await getEmailsByRole('super_fl') : []

    let delegates = []
    if (requiredApproverEmail || requiredRole) {
      const today = todayStr()
      const { data } = await supabase
        .from('approval_delegations')
        .select('delegate_email, delegator_email, delegator_role')
        .is('revoked_at', null)
        .lte('start_date', today)
        .gte('end_date', today)
      delegates = (data || [])
        .filter(d => requiredApproverEmail
          ? d.delegator_email.toLowerCase() === requiredApproverEmail.toLowerCase()
          : d.delegator_role === requiredRole)
        .map(d => d.delegate_email)
    }

    const seen = new Set()
    return [...base, ...superFl, ...delegates].filter(e => {
      const k = String(e || '').toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
  } catch (err) {
    console.error('Resolving approval recipients failed:', err)
    return []
  }
}

// Who to tell that a purchase order is waiting: the Finance team members who have the PO approval
// switch on, and anyone covering for a Finance team member through an out-of-office delegation.
export async function getPOApproverRecipients() {
  try {
    const { data: members } = await supabase.from('team_members').select('email').eq('role', 'finance').eq('can_approve_pos', true)
    const today = todayStr()
    const { data: dels } = await supabase.from('approval_delegations').select('delegate_email, delegator_role')
      .is('revoked_at', null).lte('start_date', today).gte('end_date', today)
    const delegates = (dels || []).filter(d => d.delegator_role === 'finance').map(d => d.delegate_email)
    const seen = new Set()
    return [...(members || []).map(m => m.email), ...delegates].filter(e => {
      const k = String(e || '').toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
  } catch (err) {
    console.error('Resolving PO approvers failed:', err)
    return []
  }
}

// One in-app notification per recipient. Best-effort — never throws.
export async function notifyEmails(emails, { type, message, relatedType, relatedId }) {
  try {
    await Promise.all((emails || []).map(email => supabase.from('expense_notifications').insert({
      recipient_id: email, type, message, related_type: relatedType, related_id: relatedId,
    })))
  } catch { /* non-blocking */ }
}
