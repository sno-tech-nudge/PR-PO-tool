// Entity → Programme → Sub-programme → Donor, from the mapping sheet ("PRPO module - mapping - mapping.csv").
// The sheet also gives a Location for each donor. It is not a field in any form: it is looked up from the
// donor and shown to approvers, small and blue, next to the sub-programme (see getLocation below).
// To update the mapping: node scripts/gen-donor-map.cjs "<path to the CSV>"
// <generated:donor-map> Written by scripts/gen-donor-map.cjs from the mapping sheet. Do not edit by hand.
const MAPPED = {
  'Nudge Lifeskills Foundation': {
    'Livelihood Program': {
      'NRM': ['KPMG Global Services - JH'],
      'PMU': ['DXC - AS', 'DXC - ML', 'Great Eastern - AS', 'Great Eastern - ML', 'HDFC - RJ', 'HDFC - JH', 'HDFC - TR', 'HDFC - AS', 'HDFC - ML', 'KPMG Global Services - DL', 'SDMC - WB'],
      'SAY': ['ITC - AS', 'SDMC - TR', 'KPMG Global Services - AR'],
      'SSS': ['Great Eastern - ML', 'Manipal - JH', 'Zee - JH'],
      'OI': ['ABCF - JH', 'AHT - RJ', 'KPMG Global Services - RJ', 'Daily Rounds - JH', 'Target - KA', 'Omega - KA', 'Westbridge - JH'],
      'Insight': ['SIDBI', 'HAL'],
    },
    'Livelihood Ecosystem': {
      'Prize': ['Mphasis - Prize', 'Safechem - Socent'],
      'IAF': ['Mphasis - JH', 'Mphasis - KA'],
      'Socent': ['Mphasis - Socent', 'Bajaj - Socent', 'Fidelity - Socent', 'Target - Socent'],
    },
    'Central': {
      'Admin & Office': ['Unrestricted / Overheads'],
      'Central S&O': ['Unrestricted / Overheads'],
      'Finance & Legal': ['Unrestricted / Overheads'],
      'Fundraising': ['Unrestricted / Overheads'],
      'Government Alliance': ['Unrestricted / Overheads'],
      'Marketing': ['Unrestricted / Overheads'],
      'People & Culture': ['Unrestricted / Overheads'],
    },
  },
  'Nudge Lifeskills Foundation - FCRA': {
    'Central': {
      'Admin & Office': ['Unrestricted / Overheads'],
      'Central S&O': ['Unrestricted / Overheads'],
      'Finance & Legal': ['Unrestricted / Overheads'],
      'Fundraising': ['Unrestricted / Overheads'],
      'Government Alliance': ['Unrestricted / Overheads'],
      'Marketing': ['Unrestricted / Overheads'],
      'People & Culture': ['Unrestricted / Overheads'],
    },
    'Livelihood Program': {
      'SSS': ['Arhant Social Foundation - ML', 'DBS - JH', 'Unrestricted'],
      'SAY': ['Unrestricted'],
      'Udgram': ['Oak Foundation - OD'],
      'Asha Kiran': ['BMGF - AK - UP', 'HSBC - AK - UP'],
      'EIP': ['BMGF - EIP', 'Rippleworks - EIP', 'Westbridge - EIP'],
      'Insight': ['LIF'],
      'Impact': ['Chanel Foundation'],
    },
    'Livelihood Ecosystem': {
      'Prize': ['State Street - Prize', 'BMGF - Sanmati'],
    },
  },
  'AIC Developmental Foundation': {
    'Livelihood Ecosystem': {
      'Socent': ['Meta - Socent'],
      'Prize': ['Pepsico - Prize'],
    },
    'Central': {
      'Admin & Office': ['Unrestricted / Overheads'],
      'Central S&O': ['Unrestricted / Overheads'],
      'Finance & Legal': ['Unrestricted / Overheads'],
      'Fundraising': ['Unrestricted / Overheads'],
      'Marketing': ['Unrestricted / Overheads'],
      'People & Culture': ['Unrestricted / Overheads'],
    },
  },
}

// "entity|program|sub-programme|donor" -> where that donor funds the work. More than one place means the donor alone does not say.
const LOCATIONS = {
  'Nudge Lifeskills Foundation|Livelihood Program|NRM|KPMG Global Services - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|DXC - AS': ['Assam'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|DXC - ML': ['Meghalaya'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|Great Eastern - AS': ['Assam'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|Great Eastern - ML': ['Meghalaya'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|HDFC - RJ': ['Rajasthan'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|HDFC - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|HDFC - TR': ['Tripura'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|HDFC - AS': ['Assam'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|HDFC - ML': ['Meghalaya'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|KPMG Global Services - DL': ['Delhi'],
  'Nudge Lifeskills Foundation|Livelihood Program|PMU|SDMC - WB': ['West Bengal'],
  'Nudge Lifeskills Foundation|Livelihood Program|SAY|ITC - AS': ['Assam'],
  'Nudge Lifeskills Foundation|Livelihood Program|SAY|SDMC - TR': ['Tripura'],
  'Nudge Lifeskills Foundation|Livelihood Program|SAY|KPMG Global Services - AR': ['Arunachal Pradesh'],
  'Nudge Lifeskills Foundation|Livelihood Program|SSS|Great Eastern - ML': ['Meghalaya'],
  'Nudge Lifeskills Foundation|Livelihood Program|SSS|Manipal - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Program|SSS|Zee - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Program|OI|ABCF - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Program|OI|AHT - RJ': ['Rajasthan'],
  'Nudge Lifeskills Foundation|Livelihood Program|OI|KPMG Global Services - RJ': ['Rajasthan'],
  'Nudge Lifeskills Foundation|Livelihood Program|OI|Daily Rounds - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Program|OI|Target - KA': ['Karnataka'],
  'Nudge Lifeskills Foundation|Livelihood Program|OI|Omega - KA': ['Karnataka'],
  'Nudge Lifeskills Foundation|Livelihood Program|OI|Westbridge - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Program|Insight|SIDBI': ['Pan India'],
  'Nudge Lifeskills Foundation|Livelihood Program|Insight|HAL': ['Pan India'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|Prize|Mphasis - Prize': ['Pan India'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|IAF|Mphasis - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|IAF|Mphasis - KA': ['Karnataka'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|Socent|Mphasis - Socent': ['Pan India'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|Socent|Bajaj - Socent': ['Pan India'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|Socent|Fidelity - Socent': ['Pan India'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|Socent|Target - Socent': ['Pan India'],
  'Nudge Lifeskills Foundation|Livelihood Ecosystem|Prize|Safechem - Socent': ['Pan India'],
  'Nudge Lifeskills Foundation|Central|Admin & Office|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation|Central|Central S&O|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation|Central|Finance & Legal|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation|Central|Fundraising|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation|Central|Government Alliance|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation|Central|Marketing|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation|Central|People & Culture|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Central|Admin & Office|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Central|Central S&O|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Central|Finance & Legal|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Central|Fundraising|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Central|Government Alliance|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Central|Marketing|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Central|People & Culture|Unrestricted / Overheads': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|SSS|Arhant Social Foundation - ML': ['Meghalaya'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|SSS|DBS - JH': ['Jharkhand'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|SSS|Unrestricted': ['Tripura'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|SAY|Unrestricted': ['Assam', 'Jharkhand', 'Meghalaya', 'Odisha', 'Tripura', 'Arunachal Pradesh', 'Mizoram'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|Udgram|Oak Foundation - OD': ['Odisha'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|Asha Kiran|BMGF - AK - UP': ['Uttar Pradesh'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|Asha Kiran|HSBC - AK - UP': ['Uttar Pradesh'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|EIP|BMGF - EIP': ['Pan India'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|Insight|LIF': ['Pan India'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|EIP|Rippleworks - EIP': ['Pan India'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|EIP|Westbridge - EIP': ['Pan India'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Program|Impact|Chanel Foundation': ['Bangalore'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Ecosystem|Prize|State Street - Prize': ['Pan India'],
  'Nudge Lifeskills Foundation - FCRA|Livelihood Ecosystem|Prize|BMGF - Sanmati': ['Pan India'],
  'AIC Developmental Foundation|Livelihood Ecosystem|Socent|Meta - Socent': ['Pan India'],
  'AIC Developmental Foundation|Livelihood Ecosystem|Prize|Pepsico - Prize': ['Pan India'],
  'AIC Developmental Foundation|Central|Admin & Office|Unrestricted / Overheads': ['Bangalore'],
  'AIC Developmental Foundation|Central|Central S&O|Unrestricted / Overheads': ['Bangalore'],
  'AIC Developmental Foundation|Central|Finance & Legal|Unrestricted / Overheads': ['Bangalore'],
  'AIC Developmental Foundation|Central|Fundraising|Unrestricted / Overheads': ['Bangalore'],
  'AIC Developmental Foundation|Central|Marketing|Unrestricted / Overheads': ['Bangalore'],
  'AIC Developmental Foundation|Central|People & Culture|Unrestricted / Overheads': ['Bangalore'],
}
// </generated:donor-map>

// Not in the mapping sheet. Kept from the earlier mapping, unchanged, so older records still resolve.
const LEGACY = {
  'TNF': {
    'EIP': {
      'EIP - AK - P2': ['BMGF AK TNF'],
      'EIP - UdGram':  ['LIF'],
    },
  },
}

export const DONOR_MAP = { ...MAPPED, ...LEGACY }

export const ENTITIES = Object.keys(DONOR_MAP)

export function getPrograms(entity) {
  if (!entity || !DONOR_MAP[entity]) return []
  return Object.keys(DONOR_MAP[entity])
}

export function getSubprograms(entity, program) {
  if (!entity || !program) return []
  return Object.keys(DONOR_MAP[entity]?.[program] || {})
}

export function getDonors(entity, program, subprogram) {
  if (!entity || !program || !subprogram) return []
  return DONOR_MAP[entity]?.[program]?.[subprogram] || []
}

// Where the work is, for the approver: looked up from entity, programme, sub-programme and donor, ignoring
// case and spacing so older records still match. Null when it is not known, or when the same donor works in
// several places under one sub-programme (the donor alone then does not say).
const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase()
const LOCATION_INDEX = new Map(Object.entries(LOCATIONS).map(([k, v]) => [k.split('|').map(norm).join('|'), v]))
export function getLocation(entity, program, subprogram, donor) {
  const places = LOCATION_INDEX.get([entity, program, subprogram, donor].map(norm).join('|'))
  return places && places.length === 1 ? places[0] : null
}

// Flattened donor list for a Programme — merges every sub-programme's donors
// into one deduplicated list, for forms that don't ask Sub-Programme
// separately (see ExpenseDetails.jsx).
export function getDonorsForProgram(entity, program) {
  if (!entity || !program) return []
  const subMap = DONOR_MAP[entity]?.[program] || {}
  return [...new Set(Object.values(subMap).flat())]
}

// Revenue / Capital / Program classification (Zoho-style expense nature)
export const EXPENSE_NATURES = [
  'Revenue Expenditure',
  'Capital Expenditure (CAPEX)',
]

// Validate a multi-donor allocation list. Each row: { entity, program, subprogram, donor, percent }.
// Valid when there is at least one row, every row has a donor + positive percent, and percents total 100.
export function validateAllocations(list) {
  if (!Array.isArray(list) || list.length === 0) return { valid: false, total: 0 }
  let total = 0
  let rowsOk = true
  for (const a of list) {
    const pct = Number(a?.percent) || 0
    if (!a?.donor || pct <= 0) rowsOk = false
    total += pct
  }
  const total2 = Math.round(total * 100) / 100
  return { valid: rowsOk && total2 === 100, total: total2 }
}

// Pick the highest-% allocation — used to back-fill the legacy single donor/program/subprogram fields.
export function primaryAllocation(list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return list.reduce((best, a) => ((Number(a?.percent) || 0) > (Number(best?.percent) || 0) ? a : best), list[0])
}
