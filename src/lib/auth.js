// ─── Role & name mapping ──────────────────────────────────────────────────────
const ROLE_MAP = {
  'gaurangwadhawan3@gmail.com':    'employee',
  'anurag.vaishnav@thenudge.org':  'manager',
  'gaurang.wadhawan@thenudge.org': 'finance',

  // ─── Test accounts ────────────────────────────────────────────────────────
  'employee1@test.com': 'employee',
  'employee2@test.com': 'employee',
  'employee3@test.com': 'employee',
  'manager1@test.com':  'manager',
  'manager2@test.com':  'manager',
  'finance1@test.com':  'finance',
}

const NAME_MAP = {
  'gaurangwadhawan3@gmail.com':    'Gaurang Wadhawan',
  'anurag.vaishnav@thenudge.org':  'Anurag Vaishnav',
  'gaurang.wadhawan@thenudge.org': 'Gaurang Wadhawan',

  // ─── Test accounts ────────────────────────────────────────────────────────
  'employee1@test.com': 'Test Employee 1',
  'employee2@test.com': 'Test Employee 2',
  'employee3@test.com': 'Test Employee 3',
  'manager1@test.com':  'Test Manager 1',
  'manager2@test.com':  'Test Manager 2',
  'finance1@test.com':  'Test Finance 1',
}

const ROLE_LABEL = {
  employee: 'Employee',
  manager:  'Manager',
  finance:  'Finance Team',
}

const SESSION_KEY = 'nudge_user_email'

export const ALLOWED_EMAILS = Object.keys(ROLE_MAP)

export function getFinanceEmails() {
  return Object.entries(ROLE_MAP).filter(([, role]) => role === 'finance').map(([email]) => email)
}

export function getRoleFromEmail(email) {
  return ROLE_MAP[email?.toLowerCase()?.trim()] || null
}

export function getNameFromEmail(email) {
  return NAME_MAP[email?.toLowerCase()?.trim()] || (email?.split('@')[0] || 'User')
}

export function getRoleLabel(role) {
  return ROLE_LABEL[role] || role
}

export const canAccessFinance   = (role) => role === 'finance'
export const canAccessApprovals = (role) => role === 'manager' || role === 'finance'

// ─── Session — stored in localStorage, no backend auth ───────────────────────
export function buildUser(email) {
  const role = getRoleFromEmail(email)
  if (!role) return null
  return {
    id:        email,          // use email as stable ID
    email,
    role,
    name:      getNameFromEmail(email),
    roleLabel: getRoleLabel(role),
  }
}

export function signIn(email) {
  const normalized = email.toLowerCase().trim()
  if (!getRoleFromEmail(normalized)) {
    return { error: 'This email is not authorised. Contact your administrator.' }
  }
  localStorage.setItem(SESSION_KEY, normalized)
  return { user: buildUser(normalized) }
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
}

export function getSession() {
  const email = localStorage.getItem(SESSION_KEY)
  return email ? buildUser(email) : null
}

// Keep enrichUser for any legacy callsites
export function enrichUser(user) { return user }
