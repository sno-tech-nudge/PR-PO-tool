// Source: "PRPO module - mapping - mapping.pdf" — Entity → Programme →
// Sub-programme → Donor. Donor names already carry their location as an
// explicit suffix exactly as given in the source mapping (e.g. "DXC - AS"
// for Assam, "DXC - ML" for Meghalaya, both under the same PMU
// sub-programme), so no separate Location field is needed in this cascade.
export const DONOR_MAP = {
  'Nudge Lifeskills Foundation': {
    'Livelihood Program': {
      'NRM': ['KPMG Global Services - JH'],
      'PMU': [
        'DXC - AS', 'DXC - ML',
        'Great Eastern - AS', 'Great Eastern - ML',
        'HDFC - RJ', 'HDFC - JH', 'HDFC - TR', 'HDFC - AS', 'HDFC - ML',
        'KPMG Global Services - DL',
        'SDMC - WB',
      ],
      'SAY': ['ITC - AS', 'SDMC - TR', 'KPMG Global Services - AR'],
      'SSS': ['Great Eastern - ML', 'Manipal - JH', 'Zee - JH'],
      'OI': [
        'ABCF - JH', 'AHT - RJ', 'KPMG Global Services - RJ', 'Daily Rounds - JH',
        'Target - KA', 'Omega - KA', 'Westbridge - JH',
      ],
    },
    'Livelihood Ecosystem': {
      'Prize':  ['Mphasis - Prize', 'Safechem - Socent'],
      'IAF':    ['Mphasis - JH', 'Mphasis - KA'],
      'Socent': ['Mphasis - Socent', 'Bajaj - Socent', 'Fidelity - Socent', 'Target - Socent'],
    },
    'Central': {
      'Admin & Office':      ['Unrestricted / Overheads'],
      'Central S&O':         ['Unrestricted / Overheads'],
      'Finance & Legal':     ['Unrestricted / Overheads'],
      'Fundraising':         ['Unrestricted / Overheads'],
      'Government Alliance': ['Unrestricted / Overheads'],
      'Marketing':           ['Unrestricted / Overheads'],
      'People & Culture':    ['Unrestricted / Overheads'],
    },
  },
  'Nudge Lifeskills Foundation - FCRA': {
    'Central': {
      'Admin & Office':      ['Unrestricted / Overheads'],
      'Central S&O':         ['Unrestricted / Overheads'],
      'Finance & Legal':     ['Unrestricted / Overheads'],
      'Fundraising':         ['Unrestricted / Overheads'],
      'Government Alliance': ['Unrestricted / Overheads'],
      'Marketing':           ['Unrestricted / Overheads'],
      'People & Culture':    ['Unrestricted / Overheads'],
    },
    'Livelihood Program': {
      'SSS':        ['Arhant Social Foundation - ML', 'DBS - JH'],
      'Udgram':     ['Oak Foundation - OD'],
      'Asha Kiran': ['BMGF - AK - UP'],
      'EIP':        ['BMGF - EIP', 'Rippleworks - EIP', 'Westbridge - EIP'],
      'Insight':    ['LIF'],
    },
    'Livelihood Ecosystem': {
      'Prize': ['State Street - Prize', 'BMGF - Sanmati'],
    },
  },
  'AIC Developmental Foundation': {
    'Livelihood Ecosystem': {
      'Socent': ['Meta - Socent'],
      'Prize':  ['Pepsico - Prize'],
    },
    'Central': {
      'Admin & Office':   ['Unrestricted / Overheads'],
      'Central S&O':      ['Unrestricted / Overheads'],
      'Finance & Legal':  ['Unrestricted / Overheads'],
      'Fundraising':      ['Unrestricted / Overheads'],
      'Marketing':        ['Unrestricted / Overheads'],
      'People & Culture': ['Unrestricted / Overheads'],
    },
  },
}

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
