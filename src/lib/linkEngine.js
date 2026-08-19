import { supabase } from './supabase'

function diceCoefficient(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = new Map()
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.substring(i, i + 2)
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1)
  }
  let intersection = 0
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.substring(i, i + 2)
    const count = bigrams.get(bg) || 0
    if (count > 0) { bigrams.set(bg, count - 1); intersection++ }
  }
  return (2 * intersection) / (a.length + b.length - 2)
}

function vendorNamesMatch(a, b) {
  if (!a || !b) return false
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  return na === nb || na.includes(nb) || nb.includes(na) || diceCoefficient(na, nb) > 0.55
}

function scoreMatch(prAmount, prSubmittedAt, prRequestedBy, prVendorName, reportAmount, reportCreatedAt, reportEmail, reportVendorNames) {
  let score = 0
  if (reportEmail === prRequestedBy) score += 20
  const amtDiff = Math.abs((reportAmount || 0) - prAmount) / (prAmount || 1)
  if (amtDiff <= 0.05) score += 30
  else if (amtDiff <= 0.10) score += 15
  if (prSubmittedAt && reportCreatedAt) {
    const daysDiff = Math.abs(new Date(prSubmittedAt) - new Date(reportCreatedAt)) / 86400000
    if (daysDiff <= 30) score += 20
    else if (daysDiff <= 60) score += 10
  }
  if (prVendorName && reportVendorNames && reportVendorNames.some(v => vendorNamesMatch(v, prVendorName))) {
    score += 30
  }
  return score
}

export async function autoLinkPRToExpense(triggerId, triggerType) {
  try {
    if (triggerType === 'pr') {
      const { data: pr } = await supabase
        .from('purchase_requests')
        .select('id, amount, submitted_at, requested_by, vendor_id, vendors(org_name)')
        .eq('id', triggerId)
        .single()
      if (!pr) return

      const { data: reports } = await supabase
        .from('expense_reports')
        .select('id, employee_email, total_amount, created_at, report_expenses(expense_details(vendor))')
        .is('pr_id', null)
        .order('created_at', { ascending: false })
        .limit(50)

      let best = null, bestScore = 0
      const prVendorName = pr.vendors?.org_name

      for (const report of reports || []) {
        const vendorNames = (report.report_expenses || []).map(re => re.expense_details?.vendor).filter(Boolean)
        const score = scoreMatch(pr.amount, pr.submitted_at, pr.requested_by, prVendorName, report.total_amount, report.created_at, report.employee_email, vendorNames)
        if (score > bestScore) { bestScore = score; best = report }
      }

      if (!best || bestScore < 50) return
      const confidence = bestScore >= 80 ? 'high' : 'medium'

      await supabase.from('purchase_requests').update({ linked_expense_report_id: best.id, link_confidence: confidence }).eq('id', triggerId)
      await supabase.from('expense_reports').update({ pr_id: triggerId, link_confidence: confidence }).eq('id', best.id)

      if (confidence === 'medium') {
        // TODO(auth): recipient_id is a single hardcoded test account — once
        // team_members exists (see src/lib/auth.js), notify every finance
        // team member via getFinanceEmails() instead of one fixed address.
        await supabase.from('expense_notifications').insert({
          recipient_id: 'finance1@test.com',
          report_id: best.id,
          type: 'link_suggestion',
          message: `PR auto-linked to an expense report (medium confidence). Please verify in Finance > All Reports.`,
          related_type: 'report',
          related_id: best.id,
        })
      }

    } else if (triggerType === 'expense_report') {
      const { data: report } = await supabase
        .from('expense_reports')
        .select('id, employee_email, total_amount, created_at, report_expenses(expense_details(vendor))')
        .eq('id', triggerId)
        .single()
      if (!report) return

      const { data: prs } = await supabase
        .from('purchase_requests')
        .select('id, amount, submitted_at, requested_by, vendor_id, vendors(org_name)')
        .is('linked_expense_report_id', null)
        .eq('requested_by', report.employee_email)
        .in('status', ['approved', 'po_generated'])
        .order('created_at', { ascending: false })
        .limit(20)

      const vendorNames = (report.report_expenses || []).map(re => re.expense_details?.vendor).filter(Boolean)
      let best = null, bestScore = 0

      for (const pr of prs || []) {
        const score = scoreMatch(pr.amount, pr.submitted_at, pr.requested_by, pr.vendors?.org_name, report.total_amount, report.created_at, report.employee_email, vendorNames)
        if (score > bestScore) { bestScore = score; best = pr }
      }

      if (!best || bestScore < 50) return
      const confidence = bestScore >= 80 ? 'high' : 'medium'

      await supabase.from('purchase_requests').update({ linked_expense_report_id: triggerId, link_confidence: confidence }).eq('id', best.id)
      await supabase.from('expense_reports').update({ pr_id: best.id, link_confidence: confidence }).eq('id', triggerId)
    }
  } catch (err) {
    console.log('Auto-link failed:', err.message)
  }
}

export async function manualLinkPRToExpense(prId, expenseReportId) {
  try {
    await supabase.from('purchase_requests').update({ linked_expense_report_id: expenseReportId, link_confidence: 'manual' }).eq('id', prId)
    await supabase.from('expense_reports').update({ pr_id: prId, link_confidence: 'manual' }).eq('id', expenseReportId)
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
}
