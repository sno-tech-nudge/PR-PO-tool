// Source: Programwise Donor Wise.xlsx — Entity → Programme → Sub-Programme → Donor
export const DONOR_MAP = {
  'AIC': {
    'CSI': {
      'CSI - Socent': ['Target'],
      'CSI - Prize':  ['Mphasis CSI'],
    },
  },
  'Nudge Lifeskills Foundation': {
    'CSI': {
      'CSI - IAF':    ['Mphasis JH', 'Mphasis KA25'],
      'CSI - Prize':  ['Mphasis CSI', 'Safechem Enterprises'],
      'CSI - Socent': ['Bajaj'],
    },
    'EIP': {
      'EIP - INRM - JH':              ['KGS - NRM'],
      'EIP - PMU - DL (MoRD/MosJe)': ['KGS - PMU - DL'],
      'EIP - OI - RJ':                ['KGS RJ', 'ASHRAYA HASTHA TRUST (AHT)'],
      'EIP - OI - JH':                ['Aditya Birla', 'WestBridge LH & Ghumla'],
      'EIP - OI - KA':                ['Omega', 'Target'],
      'EIP - PMU - AS/ML':            ['Great Eastern'],
      'EIP - SSS - ML':               ['Great Eastern'],
      'EIP - SAY - AS':               ['ITC'],
      'EIP - SAY - JH':               ['Manipal - SAY'],
      'EIP - SSS - JH':               ['Manipal JH SSS'],
      'EIP - SSS - PJAA':             ['360 One', 'Zee - JSS'],
      'EIP - PMU':                    ['DXC', 'HDFC'],
      'EIP - PMU - WB':               ['Daily Rounds', 'SDMC - PMU WB'],
      'EIP - SAY - TR':               ['SDMC - SAY TR'],
    },
  },
  'NLF - FCRA': {
    'CSI': {
      'CSI - Prize': ['BMGF Sanmati TNF', 'Statestreet ABC TNF'],
    },
    'EIP': {
      'EIP - Insight':    ['LIF TNF'],
      'EIP - OI':         ['Rippleworks TNF'],
      'EIP - PMU':        ['WestBridge TNF'],
      'EIP - SSS - BVJVY':['DBS - JSS - BVJVY'],
      'EIP - SSS - GJ':   ['DBS - SSS - GJ/JH', 'EIP Donor TNF'],
      'EIP - SSS - ML':   ['Arhant Social Fdn'],
      'EIP - UdGram':     ['Oak TNF'],
    },
  },
  'TNF': {
    'EIP': {
      'EIP - AK - P2': ['BMGF AK TNF'],
      'EIP - UdGram':  ['LIF'],
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
