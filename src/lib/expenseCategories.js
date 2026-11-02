// The expense categories a line can carry, in the order they are offered.
export const EXPENSE_CATEGORIES = [
  'Travel Fare', 'Lodging and Boarding', 'Food', 'Bike Fare',
  'Consultant Fee', 'Professional Fee', 'Retainership / Consultancy',
  'Legal Fees', 'Courier', 'Service', 'Staff Welfare', 'Filing Fees',
  'Furniture and Fixtures', 'Housekeeping', 'Leasehold Improvements',
  'Medicine', 'Relocation Allowance', 'Repairs and Maintenance',
  'Subscription / Software', 'Learning and Development',
  'Machinery & Plants', 'Prize Challenge', 'Hiring', 'Other',
]

// "Other" on its own says nothing, so whoever picks it also types what it is
// (kept in sub_category on an expense, and as `other` on a line of an itemized
// expense or a TDS split).
export const OTHER_CATEGORY = 'Other'

// How to show an expense's category: "Other (stage hire)" instead of just "Other".
export function categoryLabel(expense) {
  const cat = expense?.category
  if (!cat) return ''
  const what = String(expense?.sub_category || '').trim()
  return cat === OTHER_CATEGORY && what ? `${cat} (${what})` : cat
}
