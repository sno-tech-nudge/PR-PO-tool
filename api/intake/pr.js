// Called by Nucleus's "intake-proxy" edge function (op: "submit_pr"). Builds
// the exact same `purchase_requests` insert row + pr_approvals chain
// PRForm.jsx's handleSubmit() does for an in-tool submission — same
// document-numbering sequence, same Functional Leader -> PR Approver chain,
// same notifications — so a Nucleus-originated PR is indistinguishable from
// one raised directly here.
import { supabaseAdmin, requireIntakeAuth, nextDocNumber } from '../_lib/supabaseAdmin.js'
import { sendViaResend } from '../_lib/mailer.js'
import { buildEmail as buildPrEmail } from '../send-pr-email.js'
import { buildLevelAwareSteps } from '../../src/lib/prStatusSteps.js'

const PR_MIN = 25000

// Mirrors src/lib/approvalEngine.js's getPRApprovalLevels/getRequiredQuotes —
// duplicated (not imported) because that module's own imports pull in
// browser-facing src/lib modules (reportEmail.js uses a relative /api fetch
// that only resolves inside a browser origin). These three lines are the
// entire fixed policy, so keeping a second copy here is cheap and safe.
function prApprovalLevels() {
  return [
    { level: 1, role: 'fl', label: 'Functional Leader' },
    { level: 2, role: 'pr_approver', label: 'PR Approver' },
  ]
}
function requiredQuotes(amount) {
  return amount > 200000 ? 3 : 2
}

// Nucleus's form currently offers "Revenue"/"Capital"; this app's own
// EXPENSE_NATURES (src/lib/donorData.js) are the fuller "Revenue
// Expenditure"/"Capital Expenditure (CAPEX)". Accept either so this keeps
// working if Nucleus is ever changed to send the real values directly.
const EXPENSE_NATURE_MAP = {
  Revenue: 'Revenue Expenditure',
  Capital: 'Capital Expenditure (CAPEX)',
  'Revenue Expenditure': 'Revenue Expenditure',
  'Capital Expenditure (CAPEX)': 'Capital Expenditure (CAPEX)',
}

function filePath(ref) {
  return ref?.storage_path || null
}

function lineItemsBase(items) {
  return items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate_per_unit) || 0), 0)
}

function distinctCategories(items) {
  return [...new Set(items.map(it => it.category).filter(Boolean))]
}

function primaryAllocation(list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return list.reduce((best, a) => ((Number(a?.allocation_pct) || 0) > (Number(best?.allocation_pct) || 0) ? a : best), list[0])
}

function validate(v) {
  const errors = []
  if (!v.vendor_id) errors.push('vendor_id is required (select an approved vendor)')
  const allocations = Array.isArray(v.allocations) ? v.allocations : []
  if (allocations.length === 0) errors.push('at least one donor allocation is required')
  const allocTotal = Math.round(allocations.reduce((s, a) => s + (Number(a.allocation_pct) || 0), 0) * 100) / 100
  if (allocations.length && allocTotal !== 100) errors.push(`donor allocations must total 100% (got ${allocTotal}%)`)
  if (allocations.some(a => !a.donor)) errors.push('every allocation row needs a donor')

  const lineItems = Array.isArray(v.line_items) ? v.line_items : []
  if (lineItems.length === 0) errors.push('at least one line item is required')
  if (lineItems.some(it => !((Number(it.quantity) || 0) > 0 && (Number(it.rate_per_unit) || 0) > 0 && it.category))) {
    errors.push('every line item needs a positive quantity, a positive rate, and a category')
  }

  if (!v.purpose?.trim()) errors.push('purpose is required')
  if (!v.from_date) errors.push('from_date is required')
  if (!v.to_date) errors.push('to_date is required')
  if (!v.expense_nature || !EXPENSE_NATURE_MAP[v.expense_nature]) errors.push('expense_nature must be "Revenue" or "Capital"')

  const total = lineItemsBase(lineItems) + (Number(v.tax_amount) || 0) + (Number(v.incidental_amount) || 0)
  if (total < PR_MIN) errors.push(`total amount must be at least ₹${PR_MIN.toLocaleString('en-IN')}`)

  if (v.quote_mode === 'single_source') {
    if (!v.single_source_justification?.trim()) errors.push('single_source_justification is required')
    if (!filePath(v.single_source_quote?.file)) errors.push('single_source_quote is required')
  } else if (v.quote_mode === 'multi_quote') {
    const quotes = Array.isArray(v.quotes) ? v.quotes : []
    const uploaded = quotes.filter(q => filePath(q.file)).length
    const needed = requiredQuotes(total)
    if (uploaded < needed) errors.push(`at least ${needed} quotes are required for a total of this size`)
    if (quotes.length > 1 && !filePath(v.comparative_statement)) errors.push('comparative_statement is required with more than one quote')
  } else {
    errors.push('quote_mode must be "single_source" or "multi_quote"')
  }

  const advance = Number(v.advance_percent)
  if (!(advance >= 0 && advance <= 100)) errors.push('advance_percent must be between 0 and 100')
  if (advance >= 100) {
    if (!v.advance_fl_email_ack) errors.push('advance_fl_email_ack is required for a 100% advance')
    if (!filePath(v.advance_fl_email_screenshot)) errors.push('advance_fl_email_screenshot is required for a 100% advance')
  } else if (advance >= 0) {
    if (!v.credit_term_frequency) errors.push('credit_term_frequency is required')
    if (!v.credit_term_date) errors.push('credit_term_date is required')
  }

  return errors
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireIntakeAuth(req, res)) return

  const v = req.body || {}
  if (!v.submitted_by) {
    res.status(400).json({ error: 'submitted_by is required' })
    return
  }

  const errors = validate(v)
  if (errors.length) {
    res.status(400).json({ error: errors.join('; ') })
    return
  }

  try {
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from('vendors')
      .select('id, org_name, status')
      .eq('id', v.vendor_id)
      .maybeSingle()
    if (vendorError) throw vendorError
    if (!vendor || vendor.status !== 'approved') {
      res.status(400).json({ error: 'vendor_id must reference an approved vendor' })
      return
    }

    const lineItems = v.line_items.map(it => ({
      description: it.description || '',
      quantity: Number(it.quantity) || 0,
      category: it.category || null,
      rate_per_unit: Number(it.rate_per_unit) || 0,
    }))
    const base = lineItemsBase(lineItems)
    const tax = Number(v.tax_amount) || 0
    const incidental = Number(v.incidental_amount) || 0
    const total = Math.round((base + tax + incidental) * 100) / 100

    const allocations = v.allocations.map(a => ({
      entity: a.entity || null,
      program: a.program || null,
      subprogram: a.subprogram || null,
      donor: a.donor,
      percent: Number(a.allocation_pct) || 0,
    }))
    const primary = primaryAllocation(v.allocations) || {}

    // Build the `quotes` JSON column in this app's own row shape
    // ({vendor_name, amount, quote_path, selected}) — QuoteRows.jsx writes
    // to the same shape even in single-source mode (one row, selected:true).
    // Nucleus has no "pick the winning quote" UI for multi_quote, so the
    // lowest-amount quote is marked selected as a reasonable default.
    let quotes, quotePaths, singleSourceJustification, comparativeStatementPath
    if (v.quote_mode === 'single_source') {
      quotes = [{ vendor_name: '', amount: '', quote_path: filePath(v.single_source_quote.file), selected: true }]
      quotePaths = [filePath(v.single_source_quote.file)].filter(Boolean)
      singleSourceJustification = v.single_source_justification.trim()
      comparativeStatementPath = null
    } else {
      const rows = v.quotes.map(q => ({ vendor_name: q.vendor_name || '', amount: q.amount ?? '', quote_path: filePath(q.file), selected: false }))
      const cheapestIdx = rows.reduce((best, r, i) => (Number(r.amount) || Infinity) < (Number(rows[best].amount) || Infinity) ? i : best, 0)
      if (rows.length) rows[cheapestIdx].selected = true
      quotes = rows
      quotePaths = rows.map(r => r.quote_path).filter(Boolean)
      singleSourceJustification = null
      comparativeStatementPath = v.quotes.length > 1 ? filePath(v.comparative_statement) : null
    }

    const advancePercent = Number(v.advance_percent) || 0
    const prNumber = await nextDocNumber('PR')

    const payload = {
      pr_number: prNumber,
      vendor_id: v.vendor_id,
      requested_by: v.submitted_by,
      amount: total,
      quantity: lineItems.length === 1 ? lineItems[0].quantity || null : null,
      rate_per_unit: lineItems.length === 1 ? lineItems[0].rate_per_unit || null : null,
      base_amount: base,
      line_items: lineItems,
      tax_amount: tax,
      gst_amount: tax,
      incidental_amount: incidental,
      budgeted: !!v.budgeted,
      category: distinctCategories(lineItems).join(', ') || null,
      expense_type: EXPENSE_NATURE_MAP[v.expense_nature],
      entity: primary.entity || null,
      donor_name: primary.donor || null,
      program: primary.program || null,
      subprogram: primary.subprogram || null,
      donor_allocations: allocations,
      from_date: v.from_date,
      to_date: v.to_date,
      purpose: v.purpose.trim(),
      is_recurring: !!v.is_recurring,
      recurring_frequency: v.is_recurring ? (v.recurring_frequency || null) : null,
      quotes,
      quote_paths: quotePaths,
      single_source_justification: singleSourceJustification,
      comparative_statement_path: comparativeStatementPath,
      payment_terms: 'advance',
      advance_percent: advancePercent,
      after_delivery_percent: 100 - advancePercent,
      advance_fl_email_ack: advancePercent >= 100 ? !!v.advance_fl_email_ack : false,
      advance_approval_screenshot_path: advancePercent >= 100 ? filePath(v.advance_fl_email_screenshot) : null,
      credit_term_frequency: advancePercent < 100 ? (v.credit_term_frequency || null) : null,
      credit_term_date: advancePercent < 100 ? (v.credit_term_date || null) : null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }

    const { data: prRow, error: insertError } = await supabaseAdmin.from('purchase_requests').insert(payload).select().single()
    if (insertError) throw insertError

    const levels = prApprovalLevels()
    const approvalRecords = levels.map((l, idx) => ({
      pr_id: prRow.id,
      approver_level: l.level,
      approver_name: l.label,
      approver_email: '',
      required_role: l.role,
      status: idx === 0 ? 'pending' : 'waiting',
    }))
    await supabaseAdmin.from('pr_approvals').insert(approvalRecords)

    // Best-effort notifications — must never fail an already-committed
    // submission.
    try {
      const { data: flMembers } = await supabaseAdmin.from('team_members').select('email').eq('role', 'fl')
      const advNote = advancePercent >= 100 ? ' — 100% ADVANCE: email approval required.' : ''
      // "(via Nucleus)" tag is deliberate — lets the team gauge Nucleus
      // adoption over time straight from the notification feed, per an
      // explicit ask, rather than needing a separate report.
      await Promise.all((flMembers || []).map(m => supabaseAdmin.from('expense_notifications').insert({
        recipient_id: m.email,
        type: 'pr_submitted',
        message: `New PR ${prNumber} for ₹${total.toLocaleString('en-IN')} (${distinctCategories(lineItems).join(', ')}) requires Functional Leader approval. Raised via Nucleus.${advNote}`,
        related_type: 'pr',
        related_id: prRow.id,
      })))
    } catch (err) {
      console.error('intake/pr: notification insert failed (non-blocking):', err)
    }

    try {
      const slackUrl = process.env.SLACK_WEBHOOK_URL
      if (slackUrl) {
        await fetch(slackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `📝 New PR raised via Nucleus: ${prNumber} — ₹${total.toLocaleString('en-IN')} (${distinctCategories(lineItems).join(', ')}) by ${v.submitted_by}. Awaiting *Functional Leader* approval.` }),
        })
      }
    } catch (err) {
      console.error('intake/pr: Slack notify failed (non-blocking):', err)
    }

    try {
      const apiKey = process.env.RESEND_API_KEY
      if (apiKey) {
        const { subject, html, text } = buildPrEmail({
          type: 'submitted',
          prNumber,
          amount: total,
          timelineSteps: buildLevelAwareSteps('submitted', approvalRecords),
        })
        await sendViaResend({
          apiKey,
          from: process.env.RESEND_FROM_EMAIL || 'The Nudge Institute <onboarding@resend.dev>',
          to: [v.submitted_by],
          subject,
          html,
          text,
        })
      }
    } catch (err) {
      console.error('intake/pr: submitted email failed (non-blocking):', err)
    }

    res.status(200).json({ id: prRow.id, reference: prNumber })
  } catch (err) {
    console.error('intake/pr failed:', err)
    res.status(502).json({ error: err.message || 'Could not create purchase request' })
  }
}
