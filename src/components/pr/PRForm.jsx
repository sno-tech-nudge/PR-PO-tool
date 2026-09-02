import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { getPRApprovalLevels, getRequiredQuotes } from '../../lib/approvalEngine'
import { getEmailsByRole } from '../../lib/auth'
import { generatePRSummary } from '../../lib/claude'
import { EXPENSE_NATURES, validateAllocations, primaryAllocation } from '../../lib/donorData'
import { quotesValidity, advanceValidity, breakdownTotals, lineItemsBase, lineItemsValid, distinctCategories, getFiscalYearPrefix, fiscalYearStartStr } from '../../lib/formCalc'
import { notifySlack, recordUrl } from '../../lib/slack'
import VendorSelector from './VendorSelector'
import QuoteRows from './QuoteRows'
import AdvanceTable from './AdvanceTable'
import DonorAllocations from '../shared/DonorAllocations'
import AmountBreakdown from '../shared/AmountBreakdown'

const FREQUENCIES = ['One-time', 'Monthly', 'Quarterly', 'Annually']

const PR_MIN = 25000
const PR_CONTRACT_THRESHOLD = 2500000  // 25 lacs

async function generatePRNumber() {
  const fy = getFiscalYearPrefix()
  const { count } = await supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).like('pr_number', `${fy}-PR-%`)
  return `${fy}-PR-07-${((count || 0) + 1).toString().padStart(4, '0')}`
}

function StepIndicator({ current, total, labels }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600,
              background: i < current ? '#16A34A' : i === current ? '#8C3225' : '#E5E7EB',
              color: i <= current ? '#FFFFFF' : '#6B7280',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: '10px', fontWeight: i === current ? 700 : 500, color: i === current ? '#1A1F36' : '#9CA3AF', whiteSpace: 'nowrap' }}>
              {labels?.[i]}
            </div>
          </div>
          {i < total - 1 && <div style={{ width: '36px', height: '1px', background: i < current ? '#16A34A' : '#E5E7EB', marginTop: '13px' }} />}
        </div>
      ))}
    </div>
  )
}

function Field({ label, error, required, hint, children }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
        {label}{required && <span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '5px' }}>{hint}</div>}
      {children}
      {error && <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}

function sel(value, onChange, options, placeholder, onBlur) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      style={{
        width: '100%', height: '38px', border: '1px solid #D1D5DB', borderRadius: '4px',
        padding: '0 10px', fontSize: '13px', color: value ? '#1A1F36' : '#9CA3AF',
        background: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function PolicyBanner({ type, children }) {
  const styles = {
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
    error:   { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
    info:    { bg: '#fdf0ed', border: '#f9c5b7', text: '#7c2d12' },
  }
  const s = styles[type] || styles.info
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '6px', padding: '12px 16px', marginBottom: '16px' }}>
      <div style={{ fontSize: '12px', color: s.text, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function YesNoToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {[['yes', 'Budgeted'], ['no', 'Not Budgeted']].map(([key, label]) => {
        const active = (key === 'yes') === value
        return (
          <div
            key={key}
            onClick={() => onChange(key === 'yes')}
            style={{
              flex: 1, padding: '10px 12px', cursor: 'pointer', textAlign: 'center',
              border: `1.5px solid ${active ? '#8C3225' : '#E5E7EB'}`,
              background: active ? '#fdf0ed' : '#FFFFFF', borderRadius: '4px',
              fontSize: '13px', fontWeight: active ? 600 : 400, color: active ? '#8C3225' : '#374151',
            }}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}

export default function PRForm({ user, existingPR = null, onSaved, onBack }) {
  // A 'draft' record is continued, not "edited" — mirrors VendorForm.jsx's
  // isEdit/draftId split.
  const isEdit = !!existingPR && existingPR.status !== 'draft'
  const [draftId, setDraftId] = useState(existingPR?.status === 'draft' ? existingPR.id : null)
  const [step, setStep]       = useState(0)
  const [errors, setErrors]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [showBelowBlock, setShowBelowBlock] = useState(false)

  // ── Section 1: Program & Donor Details ──
  const [budgeted, setBudgeted]       = useState(existingPR?.budgeted ?? null)
  const [expenseType, setExpenseType] = useState(existingPR?.expense_type || '')
  const [allocations, setAllocations] = useState(
    existingPR?.donor_allocations?.length
      ? existingPR.donor_allocations
      : [{ entity: existingPR?.entity || '', program: existingPR?.program || '', subprogram: existingPR?.subprogram || '', donor: existingPR?.donor_name || '', percent: existingPR?.donor_name ? 100 : '' }]
  )

  // ── Section 2: Expense Details ──
  const [vendorId, setVendorId]     = useState(existingPR?.vendor_id || '')
  const [vendorData, setVendorData] = useState(null)
  const [breakdown, setBreakdown]   = useState({
    // Category used to be one field for the whole PR — for a PR saved
    // before per-item categories existed, seed every item's category from
    // that old single value so re-editing/resubmitting doesn't blank it out.
    items: existingPR?.line_items?.length
      ? existingPR.line_items.map(it => ({ description: it.description || '', quantity: it.quantity != null ? String(it.quantity) : '', category: it.category || existingPR?.category || '', ratePerUnit: it.rate_per_unit != null ? String(it.rate_per_unit) : '' }))
      : existingPR?.quantity != null || existingPR?.rate_per_unit != null
        ? [{ description: '', quantity: existingPR?.quantity != null ? String(existingPR.quantity) : '', category: existingPR?.category || '', ratePerUnit: existingPR?.rate_per_unit != null ? String(existingPR.rate_per_unit) : '' }]
        : [{ description: '', quantity: '', category: '', ratePerUnit: '' }],
    tax:        existingPR?.tax_amount != null ? String(existingPR.tax_amount) : (existingPR?.gst_amount != null ? String(existingPR.gst_amount) : ''),
    incidental: existingPR?.incidental_amount != null ? String(existingPR.incidental_amount) : '',
  })
  const [fromDate, setFromDate]       = useState(existingPR?.from_date || '')
  const [toDate, setToDate]           = useState(existingPR?.to_date || '')
  const [purpose, setPurpose]         = useState(existingPR?.purpose || '')
  const [isRecurring, setIsRecurring] = useState(existingPR?.is_recurring || false)
  const [frequency, setFrequency]     = useState(existingPR?.recurring_frequency || '')

  // ── Section 3: Quotes & Payment Terms ──
  const [quoteState, setQuoteState] = useState({
    quotes: existingPR?.quotes || (existingPR?.quote_paths || []).map(p => ({ vendor_name: '', amount: '', quote_path: p, selected: false })),
    singleSource: !!existingPR?.single_source_justification,
    singleSourceJustification: existingPR?.single_source_justification || '',
    comparative_statement_path: existingPR?.comparative_statement_path || '',
  })
  // Payment Terms — one combined section: an Advance split (default 30%,
  // editable) plus a mandatory Credit Term (frequency + due date) covering
  // the after-delivery portion. Not a choice between the two.
  const [advanceState, setAdvanceState] = useState({
    advancePercent: existingPR?.advance_percent != null ? String(existingPR.advance_percent) : '30',
    flEmailAck: existingPR?.advance_fl_email_ack || false,
    screenshotPath: existingPR?.advance_approval_screenshot_path || '',
    creditTermFrequency: existingPR?.credit_term_frequency || '',
    creditTermDate: existingPR?.credit_term_date || '',
  })

  const itemsBase = lineItemsBase(breakdown.items || [])
  const { total: numericAmount } = breakdownTotals({ ...breakdown, base: itemsBase })
  const requiredQuotes  = numericAmount >= PR_MIN ? getRequiredQuotes(numericAmount) : 0
  const approvalLevels  = numericAmount >= PR_MIN ? getPRApprovalLevels() : []
  const needsContract   = numericAmount >= PR_CONTRACT_THRESHOLD
  const belowThreshold  = numericAmount > 0 && numericAmount < PR_MIN
  const advFlags        = advanceValidity(advanceState)

  const STEPS = ['Program & Donor', 'Purchase Details', 'Review']
  const STEP_LABELS = ['Program', 'Details', 'Review']

  const allocationsValid = validateAllocations(allocations).valid
  const checklist = [
    { label: 'Budget confirmed', done: budgeted !== null },
    { label: 'Vendor approved',  done: !!vendorId },
    { label: 'Quotes attached',  done: requiredQuotes === 0 ? true : quotesValidity(quoteState, requiredQuotes).valid },
    { label: 'Payment terms set', done: advFlags.valid },
  ]

  async function handleVendorSelect(id, v) {
    setVendorId(id); setVendorData(v)
    // Auto-populate recurring details from this vendor's last recurring PR, so
    // requesters don't have to re-declare "yes, recurring, quarterly" every
    // time they raise the next PR in the same recurring series.
    if (!isEdit && id) {
      const { data } = await supabase
        .from('purchase_requests')
        .select('is_recurring, recurring_frequency')
        .eq('vendor_id', id)
        .eq('requested_by', user.email)
        .eq('is_recurring', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        setIsRecurring(true)
        setFrequency(data.recurring_frequency || '')
      }
    }
  }

  function validateStep(s) {
    const e = {}
    if (s === 0) {
      if (budgeted === null) e.budgeted = 'Please indicate whether this is budgeted'
      if (!expenseType)      e.expenseType = 'Required'
      if (!validateAllocations(allocations).valid) e.allocations = 'Donor allocations must be complete and total exactly 100%'
    }
    if (s === 1) {
      if (!vendorId) e.vendorId = 'Please select a vendor'
      if (!lineItemsValid(breakdown.items || [])) { e.amount = 'Enter quantity, category, and rate per unit for every line item.'; e.itemFields = true }
      else if (!breakdownTotals({ ...breakdown, base: itemsBase }).valid) e.amount = 'Enter tax for this purchase.'
      if (numericAmount > 0 && numericAmount < PR_MIN)
        e.amount = `Purchases under ₹25,000 don't need a PR — submit as an expense claim instead.`
      if (!fromDate) e.fromDate = 'Required'
      if (!toDate) e.toDate = 'Required'
      if (fromDate && toDate && toDate < fromDate) e.toDate = 'End date must be on or after the start date'
      if (!purpose.trim()) e.purpose = 'Required'
      if (isRecurring && !frequency) e.frequency = 'Select a frequency'
      if (!quotesValidity(quoteState, requiredQuotes).valid) {
        e.quotes = quoteState.singleSource
          ? 'You must explain why only one vendor is available, and attach that quotation.'
          : `Upload ${requiredQuotes} quotes, mark the selected vendor, and attach the comparative statement.`
      }
      if (!advFlags.valid) {
        if (advFlags.requiresFLEmail && !advanceState.flEmailAck) {
          e.advance = 'Confirm Functional Leader email approval for the 100% advance.'
        } else if (advFlags.requiresFLEmail && !advanceState.screenshotPath) {
          e.advance = 'Attach a screenshot of the Functional Leader approval email.'
        } else if (!advFlags.creditTermOk) {
          e.advance = 'Select a credit term frequency and due date.'
        } else {
          e.advance = 'Enter a valid advance percentage (0–100).'
        }
      }
    }
    return e
  }

  // Per-field validation, run on blur so a mistake (an empty Purpose, an
  // invalid date range) surfaces the moment you leave that field instead of
  // only after clicking Continue/Review — same rules as validateStep, just
  // scoped to one field so untouched fields below don't light up red too.
  function validateField(key) {
    let msg
    switch (key) {
      case 'expenseType':
        if (!expenseType) msg = 'Required'
        break
      case 'vendorId':
        if (!vendorId) msg = 'Please select a vendor'
        break
      case 'fromDate':
        if (!fromDate) msg = 'Required'
        break
      case 'toDate':
        if (!toDate) msg = 'Required'
        else if (fromDate && toDate < fromDate) msg = 'End date must be on or after the start date'
        break
      case 'purpose':
        if (!purpose.trim()) msg = 'Required'
        break
      case 'frequency':
        if (isRecurring && !frequency) msg = 'Select a frequency'
        break
      default:
        return
    }
    setErrors(prev => {
      const next = { ...prev }
      if (msg) next[key] = msg
      else delete next[key]
      return next
    })
  }

  function nextStep() {
    const e = validateStep(step)
    setErrors(e)
    if (step === 1 && belowThreshold) { setShowBelowBlock(true); return }
    if (Object.keys(e).length) return
    setStep(s => s + 1)
  }

  // Saves whatever's filled in, from any step — no validation gate, mirrors
  // VendorForm.jsx's Save as Draft. Skips pr_number (assigned only at real
  // submission, like vendor_id for vendors), AI summary, and pr_approvals —
  // those only make sense once the request is actually submitted.
  async function handleSaveDraft() {
    setSavingDraft(true); setSaveError(null)
    try {
      const cleanItems = (breakdown.items || []).filter(it => it.description || it.quantity !== '' || it.category || it.ratePerUnit !== '')
      const bd = breakdownTotals({ ...breakdown, base: lineItemsBase(cleanItems) })
      const primary = primaryAllocation(allocations) || {}
      const cleanQuotes = (quoteState.quotes || []).filter(q => q.quote_path || q.vendor_name || q.amount)

      const payload = {
        vendor_id:                 vendorId || null, // uuid column — never send '', only null or a real id
        requested_by:              user.email,
        amount:                    bd.total,
        quantity:                  cleanItems.length === 1 ? Number(cleanItems[0].quantity) || null : null,
        rate_per_unit:             cleanItems.length === 1 ? Number(cleanItems[0].ratePerUnit) || null : null,
        base_amount:               bd.base,
        line_items:                cleanItems.map(it => ({ description: it.description || '', quantity: Number(it.quantity) || 0, category: it.category || null, rate_per_unit: Number(it.ratePerUnit) || 0 })),
        tax_amount:                bd.tax,
        gst_amount:                bd.tax,
        incidental_amount:         bd.incidental,
        budgeted,
        category:                  distinctCategories(cleanItems).join(', ') || null,
        expense_type:              expenseType,
        entity:                    primary.entity || null,
        donor_name:                primary.donor || null,
        program:                   primary.program || null,
        subprogram:                primary.subprogram || null,
        donor_allocations:         allocations,
        from_date:                 fromDate || null,
        to_date:                   toDate || null,
        purpose:                   purpose.trim(),
        is_recurring:              isRecurring,
        recurring_frequency:       isRecurring ? frequency : null,
        quotes:                    cleanQuotes,
        quote_paths:               cleanQuotes.map(q => q.quote_path).filter(Boolean),
        single_source_justification: quoteState.singleSource ? quoteState.singleSourceJustification.trim() : null,
        comparative_statement_path: quoteState.singleSource ? null : (quoteState.comparative_statement_path || null),
        payment_terms:             'advance',
        advance_percent:           advFlags.advance,
        after_delivery_percent:    advFlags.afterDelivery,
        advance_fl_email_ack:      advFlags.requiresFLEmail ? !!advanceState.flEmailAck : false,
        advance_approval_screenshot_path: advFlags.requiresFLEmail ? (advanceState.screenshotPath || null) : null,
        credit_term_frequency:     advanceState.creditTermFrequency || null,
        credit_term_date:          advanceState.creditTermDate || null,
        status:                    'draft',
        submitted_at:              null,
      }

      let result
      if (draftId) {
        result = await supabase.from('purchase_requests').update(payload).eq('id', draftId).select().single()
      } else {
        result = await supabase.from('purchase_requests').insert(payload).select().single()
      }
      if (result.error) throw result.error
      if (!draftId) setDraftId(result.data.id)
      setDraftSavedAt(new Date())
    } catch (err) {
      setSaveError(err.message || 'Failed to save draft.')
    }
    setSavingDraft(false)
  }

  // Periodic autosave — every 45s, silently save a draft if there's enough
  // filled in to be worth keeping and nothing else is already saving. Uses
  // a ref so the interval always calls the latest handleSaveDraft (which
  // closes over current form state) without needing to be torn down and
  // recreated on every keystroke. Skips the write entirely if nothing has
  // changed since the last autosave (e.g. the requester stepped away) —
  // this only re-checks the fields that actually matter most (vendor,
  // amount, purpose), so it's an approximation, not a full diff, but it
  // stops the common case of re-saving an identical draft every 45s while
  // idle, which was pure wasted writes.
  const saveDraftRef = useRef(handleSaveDraft)
  useEffect(() => { saveDraftRef.current = handleSaveDraft })
  const lastAutosaveKeyRef = useRef(null)
  useEffect(() => {
    if (isEdit) return
    const hasContent = !!(vendorId || purpose.trim() || (breakdown.items || []).some(it => it.quantity || it.ratePerUnit || it.category))
    if (!hasContent) return
    const key = JSON.stringify({ vendorId, purpose, breakdown })
    const interval = setInterval(() => {
      if (saving || savingDraft) return
      if (key === lastAutosaveKeyRef.current) return
      lastAutosaveKeyRef.current = key
      saveDraftRef.current()
    }, 45000)
    return () => clearInterval(interval)
  }, [isEdit, vendorId, purpose, breakdown, saving, savingDraft])

  async function handleSubmit() {
    setSaving(true); setSaveError(null)
    try {
      const prNumber = isEdit ? existingPR.pr_number : await generatePRNumber()
      const now = new Date().toISOString()
      const cleanItems = (breakdown.items || []).filter(it => it.description || it.quantity !== '' || it.category || it.ratePerUnit !== '')
      const bd = breakdownTotals({ ...breakdown, base: lineItemsBase(cleanItems) })
      const primary = primaryAllocation(allocations) || {}
      const cleanQuotes = (quoteState.quotes || []).filter(q => q.quote_path || q.vendor_name || q.amount)

      const payload = {
        pr_number:                 prNumber,
        vendor_id:                 vendorId,
        requested_by:              user.email,
        amount:                    bd.total,
        quantity:                  cleanItems.length === 1 ? Number(cleanItems[0].quantity) || null : null,
        rate_per_unit:             cleanItems.length === 1 ? Number(cleanItems[0].ratePerUnit) || null : null,
        base_amount:               bd.base,
        line_items:                cleanItems.map(it => ({ description: it.description || '', quantity: Number(it.quantity) || 0, category: it.category || null, rate_per_unit: Number(it.ratePerUnit) || 0 })),
        tax_amount:                bd.tax,
        gst_amount:                bd.tax,               // mirror for back-compat
        incidental_amount:         bd.incidental,
        budgeted,
        category:                  distinctCategories(cleanItems).join(', ') || null,
        expense_type:              expenseType,
        entity:                    primary.entity || null,
        donor_name:                primary.donor || null,
        program:                   primary.program || null,
        subprogram:                primary.subprogram || null,
        donor_allocations:         allocations,
        from_date:                 fromDate || null,
        to_date:                   toDate || null,
        purpose:                   purpose.trim(),
        is_recurring:              isRecurring,
        recurring_frequency:       isRecurring ? frequency : null,
        quotes:                    cleanQuotes,
        quote_paths:               cleanQuotes.map(q => q.quote_path).filter(Boolean),
        single_source_justification: quoteState.singleSource ? quoteState.singleSourceJustification.trim() : null,
        comparative_statement_path: quoteState.singleSource ? null : (quoteState.comparative_statement_path || null),
        payment_terms:             'advance',
        advance_percent:           advFlags.advance,
        after_delivery_percent:    advFlags.afterDelivery,
        advance_fl_email_ack:      advFlags.requiresFLEmail ? !!advanceState.flEmailAck : false,
        advance_approval_screenshot_path: advFlags.requiresFLEmail ? (advanceState.screenshotPath || null) : null,
        credit_term_frequency:     advanceState.creditTermFrequency || null,
        credit_term_date:          advanceState.creditTermDate || null,
        status:                    'submitted',
        submitted_at:              now,
      }

      let prId
      if (isEdit) {
        // Resubmitting a rejected PR — rejection_reason is deliberately kept
        // (not nulled) so the PR list can show it was previously rejected
        // and is now resubmitted, until it's next approved or re-rejected.
        const { data, error } = await supabase.from('purchase_requests').update(payload).eq('id', existingPR.id).select().single()
        if (error) throw error
        prId = data.id
        await supabase.from('pr_approvals').delete().eq('pr_id', prId)
      } else if (draftId) {
        // Converting a draft into a real submission — no prior pr_approvals
        // rows exist yet, so there's nothing to delete before the fresh
        // insert below.
        const { data, error } = await supabase.from('purchase_requests').update(payload).eq('id', draftId).select().single()
        if (error) throw error
        prId = data.id
      } else {
        const { data, error } = await supabase.from('purchase_requests').insert(payload).select().single()
        if (error) throw error
        prId = data.id
      }

      // AI summary
      const vd = vendorData || (await supabase.from('vendors').select('org_name').eq('id', vendorId).single()).data
      const aiSummary = await generatePRSummary(
        { amount: bd.total, purpose, category: distinctCategories(cleanItems).join(', '), entity: primary.entity, donor_name: primary.donor, expense_type: expenseType, is_recurring: isRecurring, recurring_frequency: frequency },
        vd
      )
      if (aiSummary) await supabase.from('purchase_requests').update({ ai_summary: aiSummary }).eq('id', prId)

      // Approval records — fixed FL → PR Approver chain (required_role is
      // what PRDetail.jsx checks against the acting user's role).
      const levels = getPRApprovalLevels()
      const approvalRecords = levels.map((l, idx) => ({
        pr_id:          prId,
        approver_level: l.level,
        approver_name:  l.label,
        approver_email: '',
        required_role:  l.role,
        status:         idx === 0 ? 'pending' : 'waiting',
      }))
      await supabase.from('pr_approvals').insert(approvalRecords)

      // Notify FL (level 1 approver) — best-effort, must never block a
      // successful submission (the postgrest-js query builder only
      // implements .then(), not .catch(), so chaining .catch() on it
      // throws a TypeError instead of suppressing the error).
      const advNote = advFlags.requiresFLEmail ? ' — 100% ADVANCE: email approval required.' : ''
      const categoriesLabel = distinctCategories(cleanItems).join(', ')
      try {
        const flEmails = await getEmailsByRole('fl')
        await Promise.all(flEmails.map(email => supabase.from('expense_notifications').insert({
          recipient_id: email,
          type: 'pr_submitted',
          message: `New PR ${prNumber} for ₹${bd.total.toLocaleString('en-IN')} (${categoriesLabel}) requires Functional Leader approval.${advNote}`,
          related_type: 'pr',
          related_id: prId,
        })))
      } catch { /* non-blocking */ }

      notifySlack(`📝 New PR raised: <${recordUrl('pr', prId)}|${prNumber}> — ₹${bd.total.toLocaleString('en-IN')} (${categoriesLabel}) by ${user.name}. Awaiting *Functional Leader* approval.${advNote}`)

      onSaved({ prId, prNumber })
    } catch (err) {
      setSaveError(err.message || 'Failed to submit purchase request.')
    }
    setSaving(false)
  }

  // ── Below-threshold block screen ────────────────────────────────────────────
  if (showBelowBlock) {
    return (
      <div style={{ maxWidth: '540px', margin: '0 auto', padding: '24px 20px' }}>
        <button onClick={() => setShowBelowBlock(false)} style={{ background: 'none', border: 'none', fontSize: '13px', color: '#8C3225', cursor: 'pointer', padding: 0, marginBottom: '20px' }}>
          ← Back
        </button>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '28px 24px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#B91C1C', marginBottom: '12px' }}>PR Not Required</div>
          <div style={{ fontSize: '14px', color: '#7F1D1D', lineHeight: 1.7, marginBottom: '16px' }}>
            Purchases under <strong>₹25,000</strong> do not require a Purchase Request or Purchase Order. Please submit this as a direct expense claim.
          </div>
          <div style={{ background: '#FCA5A5', borderRadius: '6px', padding: '12px 16px', fontSize: '12px', color: '#7F1D1D', fontWeight: 600, lineHeight: 1.6 }}>
            ⚠ Splitting expenses across multiple requests to stay below the ₹25,000 threshold is <u>strictly prohibited</u> and will invite disciplinary action per the Procurement Policy.
          </div>
          <button
            onClick={() => { setBreakdown({ items: [{ description: '', quantity: '', category: '', ratePerUnit: '' }], tax: '', incidental: '' }); setShowBelowBlock(false) }}
            style={{ marginTop: '20px', height: '38px', padding: '0 20px', background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
          >
            Change amount
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 20px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '13px', color: '#8C3225', cursor: 'pointer', padding: 0 }}>Back</button>
        <span style={{ color: '#9CA3AF' }}>/</span>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: 0 }}>
          {isEdit ? 'Edit Purchase Request' : existingPR?.status === 'draft' ? 'Continue Purchase Request Draft' : 'New Purchase Request'}
        </h2>
      </div>
      {draftSavedAt && (
        <div style={{ fontSize: '11px', color: '#15803D', marginBottom: '12px' }}>
          Draft saved ✓ {draftSavedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {saveError && step < STEPS.length - 1 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#B91C1C' }}>
          {saveError}
        </div>
      )}

      {/* Slim progress bar — purely cosmetic, tucked above the step circles
          rather than anywhere near the form fields themselves. */}
      <div style={{ height: '4px', background: '#F3F4F6', borderRadius: '2px', marginBottom: '18px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`,
          background: '#8C3225', borderRadius: '2px', transition: 'width 0.25s ease',
        }} />
      </div>

      <StepIndicator current={step} total={STEPS.length} labels={STEP_LABELS} />
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1F36', marginBottom: '20px' }}>{STEPS[step]}</div>

      {/* ── Section 1: Program & Donor Details ── */}
      {step === 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px' }}>
          <Field label="Donor / Programme Allocation" error={errors.allocations} required hint="Split this spend across donors / programmes — must total 100%">
            <DonorAllocations value={allocations} onChange={setAllocations} error={errors.allocations} />
          </Field>

          {allocationsValid && (
            <Field label="Budgeted?" error={errors.budgeted} required hint="Is this spend within an approved budget line?">
              <YesNoToggle value={budgeted} onChange={setBudgeted} />
            </Field>
          )}

          {allocationsValid && budgeted !== null && (
            <Field label="Expense Nature" error={errors.expenseType} required hint="Revenue vs capital classification">
              {sel(expenseType, setExpenseType, EXPENSE_NATURES, 'Select nature…', () => validateField('expenseType'))}
            </Field>
          )}
        </div>
      )}

      {/* ── Section 2: Purchase Details (Expense Details + Quotes & Advance) ── */}
      {step === 1 && (
        <>
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px' }}>
          <PolicyBanner type="warning">
            <strong>Important:</strong> Splitting purchases across multiple PRs to stay under ₹25,000 is strictly prohibited and will invite disciplinary action. A minimum lead time of <strong>10 working days</strong> is required for all new procurements.
          </PolicyBanner>

          <PolicyBanner type="info">
            Only <strong>approved vendors</strong> can be selected. New vendors must complete the vendor registration process before a PR can be raised.
          </PolicyBanner>

          <Field label="Approved Vendor" error={errors.vendorId} required>
            <VendorSelector value={vendorId} onChange={handleVendorSelect} />
          </Field>

          {/* Amount breakdown: per-line-item quantity × category × rate per unit (mandatory) + tax (mandatory) + incidentals (optional) */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
              Amount (INR)<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
            </label>
            <AmountBreakdown
              value={breakdown}
              onChange={setBreakdown}
              errors={{ ...(errors.amount ? { base: errors.amount } : {}), ...(errors.itemFields ? { category: true } : {}) }}
            />
          </div>

          {numericAmount >= PR_MIN && (
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '16px', background: '#F9FAFB', borderRadius: '4px', padding: '8px 12px' }}>
              Approval route: {approvalLevels.map(l => l.label).join(' → ')} → PO Approver &nbsp;·&nbsp; {requiredQuotes} quote{requiredQuotes > 1 ? 's' : ''} required
            </div>
          )}

          {needsContract && (
            <PolicyBanner type="error">
              <strong>Contract Required:</strong> This purchase exceeds ₹25 lacs. A signed contract must be in place before goods or services are delivered. Contact accounts@thenudge.org for the contracting process. A vendor selection document with selection criteria is also required.
            </PolicyBanner>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="From Date" error={errors.fromDate} required>
              <input
                type="date"
                value={fromDate}
                min={fiscalYearStartStr()}
                onChange={e => {
                  const v = e.target.value
                  setFromDate(v)
                  if (toDate && toDate < v) setToDate('')
                }}
                onBlur={() => validateField('fromDate')}
                style={{ width: '100%', height: '38px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#1A1F36', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
              />
            </Field>
            <Field label="To Date" error={errors.toDate} required>
              <input
                type="date"
                value={toDate}
                min={fromDate || fiscalYearStartStr()}
                onChange={e => setToDate(e.target.value)}
                onBlur={() => validateField('toDate')}
                style={{ width: '100%', height: '38px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#1A1F36', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
              />
            </Field>
          </div>

          <Field label="Purpose / Description" error={errors.purpose} required>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              onBlur={() => validateField('purpose')}
              placeholder="Describe what this purchase is for and why it is needed"
              rows={3}
              style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '10px', fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </Field>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
              <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ width: '16px', height: '16px' }} />
              This is a recurring purchase
            </label>
            {isRecurring && (
              <div style={{ marginTop: '10px', paddingLeft: '24px', fontSize: '12px', color: '#6B7280' }}>
                For rate service contracts (Admin, IT), raise PR quarterly or half-yearly.
              </div>
            )}
          </div>

          {isRecurring && (
            <Field label="Frequency" error={errors.frequency} required>
              {sel(frequency, setFrequency, FREQUENCIES, 'Select frequency…', () => validateField('frequency'))}
            </Field>
          )}
        </div>

        {/* Quotes & Payment Terms — reveals once the core purchase details above are filled */}
        {vendorId && lineItemsValid(breakdown.items || []) && breakdownTotals({ ...breakdown, base: itemsBase }).valid && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px' }}>
              <PolicyBanner type="info">
                <strong>Policy requirement:</strong> {requiredQuotes} quote{requiredQuotes > 1 ? 's are' : ' is'} required for this purchase (₹{numericAmount.toLocaleString('en-IN')}). Quotes ensure the organisation gets the best price.
              </PolicyBanner>
              <QuoteRows value={quoteState} onChange={setQuoteState} requiredQuotes={requiredQuotes} error={errors.quotes} entity={primaryAllocation(allocations)?.entity} />
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1F36', marginBottom: '4px' }}>Payment Terms</div>
              <AdvanceTable value={advanceState} onChange={setAdvanceState} error={errors.advance} />
            </div>
          </div>
        )}
        </>
      )}

      {/* ── Review ── */}
      {step === 2 && (
        <div>
          {needsContract && (
            <PolicyBanner type="error">
              <strong>Reminder:</strong> This PR exceeds ₹25 lacs. Ensure a signed contract is in place before issuing the PO to the vendor.
            </PolicyBanner>
          )}

          <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' }}>{isEdit ? 'Editing' : 'New'} Purchase Request</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#1A1F36' }}>₹{numericAmount.toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px', marginBottom: '16px' }}>{vendorData?.org_name || vendorId}</div>
            <div style={{ height: '1px', background: '#F3F4F6', marginBottom: '16px' }} />

            {/* Line items */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '6px' }}>Line Items</div>
              {(breakdown.items || []).filter(it => it.quantity !== '' || it.ratePerUnit !== '' || it.category || it.description).map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#374151', marginBottom: '3px' }}>
                  <span>{it.description || `Item ${i + 1}`} — {it.category || 'No category'} — {it.quantity || 0} × ₹{(Number(it.ratePerUnit) || 0).toLocaleString('en-IN')}</span>
                  <span style={{ fontWeight: 600 }}>₹{((Number(it.quantity) || 0) * (Number(it.ratePerUnit) || 0)).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>

            {[
              ['Budgeted',      budgeted === null ? '—' : budgeted ? 'Budgeted' : 'Not Budgeted'],
              ['Expense Nature', expenseType],
              ['Categories',    distinctCategories(breakdown.items || []).join(', ') || '—'],
              ['Base Amount',   `₹${itemsBase.toLocaleString('en-IN')}`],
              ['Tax (GST)',     `₹${(Number(breakdown.tax) || 0).toLocaleString('en-IN')}`],
              (Number(breakdown.incidental) || 0) > 0 ? ['Incidentals', `₹${Number(breakdown.incidental).toLocaleString('en-IN')}`] : null,
              ['From Date',     fromDate || '—'],
              ['To Date',       toDate || '—'],
              ['Purpose',       purpose],
              isRecurring ? ['Recurring', frequency || 'Yes'] : null,
              ['Payment Terms', `${advFlags.advance}% advance · ${advFlags.afterDelivery}% after delivery`],
              ['Credit Term', advFlags.creditTermApplicable ? `${advanceState.creditTermFrequency || '—'}, due ${advanceState.creditTermDate || '—'}` : 'Not applicable — 100% advance'],
              advFlags.requiresFLEmail
                ? ['FL Approval Email', advanceState.screenshotPath ? 'Screenshot attached' : 'Not attached']
                : null,
              quoteState.singleSource
                ? ['Quotes', `Single source — ${quoteState.singleSourceJustification.substring(0, 60)}…`]
                : ['Quotes', `${quotesValidity(quoteState, requiredQuotes).uploaded} of ${requiredQuotes} uploaded`],
              ['Submission Timestamp', new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: '#9CA3AF', width: '140px', flexShrink: 0, fontSize: '12px' }}>{label}</span>
                <span style={{ color: '#1A1F36' }}>{val}</span>
              </div>
            ))}

            {/* Donor allocation lines */}
            <div style={{ marginTop: '10px', borderTop: '1px solid #F3F4F6', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '6px' }}>Donor / Programme Allocation</div>
              {allocations.map((a, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#374151', marginBottom: '3px' }}>
                  {a.percent}% · {[a.entity, a.program, a.subprogram, a.donor].filter(Boolean).join(' / ')}
                </div>
              ))}
            </div>
          </div>

          {advFlags.requiresFLEmail && (
            <PolicyBanner type="error">
              <strong>100% advance:</strong> Functional Leader approval over email is required before this PR proceeds.
              {advanceState.flEmailAck ? ' Acknowledged by requester.' : ''}
              {advanceState.screenshotPath ? ' Approval screenshot attached.' : ' Approval screenshot not yet attached.'}
            </PolicyBanner>
          )}
          {advFlags.flaggedOver30 && !advFlags.requiresFLEmail && (
            <PolicyBanner type="warning">
              <strong>Advance over 30%:</strong> This advance ({advFlags.advance}%) exceeds the guideline and may attract additional scrutiny.
            </PolicyBanner>
          )}

          {saveError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#B91C1C' }}>
              {saveError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ width: '100%', height: '44px', background: saving ? '#9CA3AF' : '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? 'Submitting…' : isEdit ? 'Resubmit Purchase Request' : 'Submit Purchase Request'}
          </button>
        </div>
      )}

      {/* Navigation */}
      {step < STEPS.length - 1 && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{ height: '40px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '14px', cursor: 'pointer' }}
            >
              Back
            </button>
          )}
          <button
            onClick={nextStep}
            style={{ height: '40px', padding: '0 24px', background: '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >
            {step === 1 ? 'Review' : 'Continue'}
          </button>
          {!isEdit && (
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft}
              style={{ height: '40px', padding: '0 18px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: savingDraft ? 'default' : 'pointer' }}
            >
              {savingDraft ? 'Saving…' : 'Save as Draft'}
            </button>
          )}
        </div>
      )}

      {step === STEPS.length - 1 && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <button
            onClick={() => setStep(s => s - 1)}
            style={{ height: '38px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
          >
            ← Edit
          </button>
          {!isEdit && (
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft}
              style={{ height: '38px', padding: '0 18px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: savingDraft ? 'default' : 'pointer' }}
            >
              {savingDraft ? 'Saving…' : 'Save as Draft'}
            </button>
          )}
        </div>
      )}

      {/* Live checklist — lets requesters see what's still missing before they hit Continue/Submit */}
      {!showBelowBlock && step < STEPS.length - 1 && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 40,
          background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px',
          padding: '14px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '190px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Before you submit
          </div>
          {checklist.map(c => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '6px', color: c.done ? '#15803D' : '#9CA3AF' }}>
              <span>{c.done ? '✓' : '○'}</span>
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
