import { checkSubmissionTiming, checkHotelLimit, checkFoodLimit, checkPerKmRate } from './policyEngine'
import { sameVendor } from './duplicateCheck'

// Helpers for the two short prompts shown while filling in an expense: the
// reason for something out of policy, and the PR/PO warning above the limit.
// Both are asked only when they apply and answered with a tap.

// Out-of-policy findings a person can sensibly explain. Anything that needs the
// expense itself changed (missing donor mention, missing boarding pass, ...) is
// left to the review step. A food or hotel bill over the per-person limit is
// included: "it was shared by several people" is one of the reasons offered.
export function explainablePolicyIssues(expense) {
  const checks = [checkSubmissionTiming, checkHotelLimit, checkFoodLimit, checkPerKmRate]
  return checks
    .map(fn => { try { return fn(expense) } catch { return null } })
    .filter(r => r && r.passed === false)
    .map(r => ({ rule: r.rule, message: r.message }))
}

export const POLICY_REASONS = [
  'It was shared by more than one person',
  'Client or donor needed it',
  'No cheaper option was available',
  'Urgent or an emergency',
  'Approved in advance',
]

export const PO_REASONS = [
  'Emergency purchase',
  'My manager approved it',
  'One-off, not a repeat purchase',
]

// Purchases over this need a PR/PO (procurement policy).
export const PO_LIMIT = 25000

// Employee spend that is not a purchase from a supplier, so a PR/PO does not apply.
const NO_PO_CATEGORIES = ['Travel Fare', 'Bike Fare', 'Lodging and Boarding', 'Food', 'Relocation Allowance', 'Medicine', 'Staff Welfare']

export function needsPoLink({ amount, category, hasPo }) {
  return !hasPo && Number(amount) > PO_LIMIT && !NO_PO_CATEGORIES.includes(category)
}

// An open PO for the same vendor, or failing that one of about the same size,
// so the person can link it with one tap instead of searching.
export function suggestPO(poOptions, vendor, amount) {
  const amt = Number(amount) || 0
  const list = poOptions || []
  const byVendor = vendor ? list.find(po => sameVendor(vendor, po.vendors?.org_name)) : null
  if (byVendor) return byVendor
  return list.find(po => amt > 0 && Math.abs(Number(po.amount) - amt) / amt <= 0.05) || null
}
