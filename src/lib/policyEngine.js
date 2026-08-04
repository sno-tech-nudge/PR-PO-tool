const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const METRO_CITIES = [
  'ahmedabad', 'bangalore', 'bengaluru', 'chennai',
  'delhi', 'new delhi', 'hyderabad', 'mumbai',
]

const NON_REIMBURSABLE_KEYWORDS = [
  'alcohol', 'beer', 'wine', 'whiskey', 'liquor', 'bar tab',
  'tobacco', 'cigarette', 'cigar',
  'credit card fee', 'late fee', 'penalty', 'fine',
  'seat upgrade', 'business class upgrade', 'lounge',
  'personal shopping', 'entertainment personal',
  'traffic violation', 'vehicle repair', 'vehicle maintenance',
]

function parseExpenseDate(dateStr) {
  if (!dateStr) return null
  const ddmm = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return new Date(parseInt(ddmm[3]), parseInt(ddmm[2]) - 1, parseInt(ddmm[1]))
  const ddmmDash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (ddmmDash) return new Date(parseInt(ddmmDash[3]), parseInt(ddmmDash[2]) - 1, parseInt(ddmmDash[1]))
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

function passed(rule) {
  return { passed: true, rule, blocking: true }
}

function failed(rule, message, extra = {}) {
  return { passed: false, rule, message, blocking: true, ...extra }
}

function notFlagged(rule) {
  return { flagged: false, rule, blocking: false }
}

function flagged(rule, message, severity) {
  return { flagged: true, rule, message, blocking: false, severity }
}

export function checkSubmissionTiming(expense) {
  try {
    const expenseDate = parseExpenseDate(expense.date)
    if (!expenseDate) return passed('submission_timing')
    const diffDays = Math.floor((Date.now() - expenseDate.getTime()) / 86400000)
    if (diffDays > 7) {
      return failed('submission_timing',
        `This expense is from ${diffDays} days ago. Claims must be submitted within 7 days of the expense date. Exceptions need FL and COO approval.`)
    }
    return passed('submission_timing')
  } catch { return passed('submission_timing') }
}

export function checkHotelLimit(expense) {
  try {
    if (expense.category !== 'Lodging and Boarding') return passed('hotel_limit')
    const text = `${expense.description || ''} ${expense.trip_name || ''}`.toLowerCase()
    const isMetro = METRO_CITIES.some(c => text.includes(c))
    const limit = isMetro ? 4000 : 3250
    const baseAmount = expense.amount / 1.18
    if (baseAmount > limit) {
      return failed('hotel_limit',
        `Hotel amount of ₹${Number(expense.amount).toLocaleString('en-IN')} exceeds the ₹${limit} per night limit for ${isMetro ? 'metro' : 'non-metro'} cities. The limit is ₹${limit} + GST per night.`)
    }
    return passed('hotel_limit')
  } catch { return passed('hotel_limit') }
}

export function checkFoodLimit(expense) {
  try {
    if (expense.category !== 'Food') return passed('food_limit')
    const perDay = expense.amount
    if (perDay > 750) {
      return failed('food_limit',
        `Food expense of ₹${Number(perDay).toLocaleString('en-IN')} per day exceeds the ₹750 per day limit. Total claimed: ₹${Number(expense.amount).toLocaleString('en-IN')}.`)
    }
    return passed('food_limit')
  } catch { return passed('food_limit') }
}

export function checkDocumentsPresent(expense) {
  try {
    if (expense.category === 'Travel Fare') {
      const desc = (expense.description || '').toLowerCase()
      const isAir = desc.includes('flight') || desc.includes('air travel') || desc.includes('flying')
      const hasBoarding = desc.includes('boarding') || desc.includes('boarding pass')
      if (isAir && !hasBoarding) {
        return failed('documents_missing', 'Boarding pass is required for air travel claims.')
      }
    }
    return passed('documents_missing')
  } catch { return passed('documents_missing') }
}

export function checkLargeClaimDonorMention(expense) {
  try {
    if (!expense.amount || expense.amount <= 20000) return passed('large_claim_no_donor')
    const text = (expense.description || '').toLowerCase()
    const keywords = ['funded by', 'donor:', 'gates', 'azim premji', 'tata', 'ford', 'rockefeller', 'foundation', 'programme', 'program', 'for the']
    const hasMention = keywords.some(k => text.includes(k))
    // FCRA: mandatory — hard block
    if ((expense.entity === 'NLF FCRA') && !hasMention) {
      return failed('large_claim_no_donor',
        'FCRA expenses above ₹20,000 require a donor name or programme confirmation. Please add this in the expense description.')
    }
    // Non-FCRA: soft guidance
    if (!hasMention) {
      return failed('large_claim_no_donor',
        'Claims above ₹20,000 need a donor name or programme confirmation in the description. Please edit the expense and add this detail.')
    }
    return passed('large_claim_no_donor')
  } catch { return passed('large_claim_no_donor') }
}

export function checkExclusionCategories(expense) {
  try {
    const desc = (expense.description || '').toLowerCase()
    if ((desc.includes('home to office') || desc.includes('office to home') || desc.includes('commute')) && !expense.trip_related) {
      return failed('exclusion_category', 'Home to office commute on regular workdays is not reimbursable.')
    }
    if (expense.expense_type === 'client_donor') {
      const guestKeywords = ['flight for', 'hotel for', 'cab for', 'accommodation for', 'ticket for', 'travel for guest']
      if (guestKeywords.some(k => desc.includes(k))) {
        return failed('exclusion_category', 'Travel and stay for external guests, donors, or speakers cannot be claimed under this policy.')
      }
    }
    return passed('exclusion_category')
  } catch { return passed('exclusion_category') }
}

export function checkPerKmRate(expense) {
  try {
    const desc = (expense.description || '').toLowerCase()
    const isPerKm = desc.includes('per km') || desc.includes('own vehicle') || desc.includes('personal car') || (desc.includes('bike') && desc.includes('km'))
    if (!isPerKm) return passed('per_km_rate')
    const kmMatch = desc.match(/(\d+)\s*km/i)
    if (!kmMatch) return passed('per_km_rate')
    const km = parseInt(kmMatch[1])
    const isBike = desc.includes('bike') || desc.includes('two wheeler') || desc.includes('scooter')
    const rate = isBike ? 5 : 15
    const vehicle = isBike ? 'bike' : 'car'
    const expected = km * rate
    if (expense.amount > expected + 50) {
      return failed('per_km_rate',
        `Personal vehicle claim of ₹${Number(expense.amount).toLocaleString('en-IN')} exceeds the ₹${rate} per km rate for ${vehicle}. Expected maximum: ₹${expected} for ${km} km.`,
        { _rate: rate, _vehicle: vehicle })
    }
    return passed('per_km_rate')
  } catch { return passed('per_km_rate') }
}

export function flagLateFlightBooking(expense) {
  try {
    if (expense.category !== 'Travel Fare') return notFlagged('late_flight')
    const desc = (expense.description || '').toLowerCase()
    if (!desc.includes('flight') && !desc.includes('air')) return notFlagged('late_flight')
    const expDate = parseExpenseDate(expense.date)
    const subDate = expense.submitted_at ? new Date(expense.submitted_at) : new Date()
    if (!expDate) return notFlagged('late_flight')
    const daysDiff = Math.floor((expDate.getTime() - subDate.getTime()) / 86400000)
    if (daysDiff < 15) {
      return flagged('late_flight', 'Flight was booked close to the travel date. Policy recommends booking at least 15 days in advance for better fares.', 'low')
    }
    return notFlagged('late_flight')
  } catch { return notFlagged('late_flight') }
}

export function flagHandwrittenBill(expense) {
  try {
    if (expense.quality_override) {
      return flagged('handwritten_bill', 'This expense has a document that may be handwritten or unclear. Please ensure it is signed and dated.', 'medium')
    }
    return notFlagged('handwritten_bill')
  } catch { return notFlagged('handwritten_bill') }
}

export function flagDuplicateExpense(expense, allExpenses) {
  try {
    if (!allExpenses || allExpenses.length <= 1) return notFlagged('duplicate')
    const expDate = parseExpenseDate(expense.date)
    const dup = allExpenses.find(other => {
      if (other.id === expense.id) return false
      const v1 = (other.vendor || '').toLowerCase().trim()
      const v2 = (expense.vendor || '').toLowerCase().trim()
      if (!v1 || !v2) return false
      if (!v1.includes(v2) && !v2.includes(v1) && v1 !== v2) return false
      if (Math.abs((other.amount || 0) - (expense.amount || 0)) > 10) return false
      const otherDate = parseExpenseDate(other.date)
      if (expDate && otherDate && Math.abs(expDate.getTime() - otherDate.getTime()) / 86400000 > 7) return false
      return true
    })
    if (dup) {
      return flagged('duplicate',
        `This looks similar to another expense in your report (${dup.vendor} ₹${Number(dup.amount).toLocaleString('en-IN')} on ${dup.date}). Please confirm this is not a duplicate.`,
        'high')
    }
    return notFlagged('duplicate')
  } catch { return notFlagged('duplicate') }
}

export function flagAmountPatternNearThreshold(expense) {
  try {
    const thresholds = [50000, 200000]
    const amt = expense.amount || 0
    for (const t of thresholds) {
      if (amt >= t - 2000 && amt < t) {
        return { ...flagged('near_threshold', 'Amount is just below approval threshold. Finance Admin review recommended.', 'medium'), internalOnly: true }
      }
    }
    return notFlagged('near_threshold')
  } catch { return notFlagged('near_threshold') }
}

export async function flagOpenTravelAdvance() {
  return notFlagged('open_advance')
}

export function flagEntityContext(expense) {
  try {
    const entity = expense.entity
    if (entity === 'NLF FCRA') {
      return flagged('entity_fcra',
        'This expense is tagged as FCRA. It will be tracked separately in FCRA accounts and reported to the Ministry of Home Affairs.',
        'low')
    }
    if (entity === 'TNF US') {
      return flagged('entity_tnf_us',
        'TNF US expenses may require additional documentation for US entity reporting.',
        'low')
    }
    return notFlagged('entity_context')
  } catch { return notFlagged('entity_context') }
}

export async function checkNonReimbursableAI(expense) {
  try {
    const combined = `${expense.vendor || ''} ${expense.description || ''}`.toLowerCase()
    const hit = NON_REIMBURSABLE_KEYWORDS.find(k => combined.includes(k))
    if (hit) {
      return failed('non_reimbursable', `This expense appears to include non-reimbursable items (${hit}). Please review the policy.`)
    }
    if (!expense.amount || expense.amount <= 500) return passed('non_reimbursable')

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 150,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `You are checking an expense claim against The Nudge Institute's expense policy.\n\nExpense details:\nVendor: ${expense.vendor || 'Unknown'}\nCategory: ${expense.category || 'Unknown'}\nAmount: ₹${expense.amount}\nDescription: ${expense.description || 'None'}\nPurpose: ${expense.purpose_type || 'Unknown'}\n\nValid expense categories: Travel, Accommodation, Meals, Learning and Development, Printing and Stationery, Rent Expense, Subgranting, Client Entertainment, Field Visit, Office Supplies, Other.\n\nNon-reimbursable items per policy:\n- Alcoholic beverages and tobacco\n- Credit card late fees\n- Preferred seat assignments, early boarding, unauthorized class upgrades\n- Home to office transport on regular workdays\n- Personal items lost, stolen, or damaged\n- Vehicle repair and maintenance\n- Traffic violations and fines\n\nDoes this expense appear to contain any non-reimbursable items?\n\nReply with JSON only, no markdown: { "contains_non_reimbursable": true or false, "reason": string or null, "confidence": "high" or "medium" or "low" }`,
        }],
      }),
    })
    const data = await response.json()
    if (data.error) return passed('non_reimbursable')
    const text = data.choices[0].message.content
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.contains_non_reimbursable && parsed.confidence === 'high') {
      return failed('non_reimbursable', `This expense may include non-reimbursable items. ${parsed.reason || ''}. Please review before submitting.`)
    }
    if (parsed.contains_non_reimbursable && parsed.confidence === 'medium') {
      return { passed: true, flagged: true, rule: 'non_reimbursable_soft', message: 'This expense has been flagged for review. It may include items not covered by policy.', blocking: false, severity: 'medium' }
    }
    return passed('non_reimbursable')
  } catch { return passed('non_reimbursable') }
}

export function determineApprovalRoute(expenses) {
  const highest = Math.max(...expenses.map(e => e.amount || 0))
  if (highest > 200000) {
    return { route: 'manager_fl_coo', label: 'Reporting Manager, Functional Lead, and COO', message: 'This report requires approval from your manager, Functional Lead, and COO due to an expense above ₹2,00,000.' }
  }
  if (highest > 50000) {
    return { route: 'manager_and_fl', label: 'Reporting Manager and Functional Lead', message: 'This report requires approval from your manager and Functional Lead due to an expense above ₹50,000.' }
  }
  return { route: 'reporting_manager', label: 'Reporting Manager', message: 'Your manager will review and approve this report.' }
}

export async function runAllChecks(expense, allExpenses) {
  const safe = (fn) => { try { return Promise.resolve(fn()) } catch { return Promise.resolve(passed('unknown')) } }

  const [hardResults, softResults, aiResult] = await Promise.all([
    Promise.all([
      safe(() => checkSubmissionTiming(expense)),
      safe(() => checkHotelLimit(expense)),
      safe(() => checkFoodLimit(expense)),
      safe(() => checkDocumentsPresent(expense)),
      safe(() => checkLargeClaimDonorMention(expense)),
      safe(() => checkExclusionCategories(expense)),
      safe(() => checkPerKmRate(expense)),
    ]),
    Promise.all([
      safe(() => flagLateFlightBooking(expense)),
      safe(() => flagHandwrittenBill(expense)),
      safe(() => flagDuplicateExpense(expense, allExpenses)),
      safe(() => flagAmountPatternNearThreshold(expense)),
      safe(() => flagEntityContext(expense)),
      flagOpenTravelAdvance(expense).catch(() => notFlagged('open_advance')),
    ]),
    checkNonReimbursableAI(expense).catch(() => passed('non_reimbursable')),
  ])

  const violations = hardResults.filter(r => r && r.passed === false)
  const flags = softResults.filter(r => r && r.flagged === true)

  if (aiResult) {
    if (aiResult.passed === false) violations.push(aiResult)
    else if (aiResult.flagged === true) flags.push(aiResult)
  }

  return { violations, flags }
}
