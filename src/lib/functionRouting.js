// Function -> Functional Leader routing for PR approvals. A PR's level-1
// "Functional Leader" step used to be pure role-based (any fl-role person
// could approve any PR) — this resolves it to the SPECIFIC FL responsible
// for the requester's own Function (team_members.function, admin-assigned
// in Settings), per the org's real Function/FL roster.

export const FUNCTIONS = [
  'Asha Kiran', 'Economic Inclusion Program', 'UdGram', 'InSight',
  'Indian Administrative Fellowship', 'Livelihood Ecosystem - Central', 'Sanmati',
  'the^delta Prize', 'the^delta Incubator & Accelerator', 'the*spark forum', 'the*spark centre',
  'Finance', 'Central Strategy & Operations', 'People & Culture', 'Government Alliances',
  'Fundraising', 'Marketing',
]

// Function -> FL email. null = no resolvable account yet for that FL — PRs
// from this function fall back to the existing any-fl-approves behavior
// until a real account exists and this map is updated.
export const FUNCTION_FL_EMAIL = {
  'Asha Kiran': null,                              // John Paul S — no account yet
  'Economic Inclusion Program': null,               // John Paul S — no account yet
  'UdGram': null,                                   // Gitanjali Rajmani — no account yet
  'InSight': 'shreeram.nanduri@thenudge.org',
  'Indian Administrative Fellowship': 'vidya@thedelta.org.in',
  'Livelihood Ecosystem - Central': 'subhashree.dutta@thenudge.org',
  'Sanmati': 'kanishka.chatterjee@thenudge.org',
  'the^delta Prize': 'kanishka.chatterjee@thenudge.org',
  'the^delta Incubator & Accelerator': 'vidya@thedelta.org.in',
  'the*spark forum': null,                          // Jerold Chagas Pereira — no account yet
  'the*spark centre': null,                         // Jerold Chagas Pereira — no account yet
  'Finance': 'balkrishan.joshi@thenudge.org',
  'Central Strategy & Operations': 'arjun.banerjee@thenudge.org',
  'People & Culture': 'arjun.banerjee@thenudge.org',
  'Government Alliances': 'atul@thenudge.org',
  'Fundraising': 'devadas.krishnan@thenudge.org',
  'Marketing': 'vaibhav.budhraja@thenudge.org',
}

export function resolveFLEmail(functionName) {
  return FUNCTION_FL_EMAIL[functionName] || null
}
