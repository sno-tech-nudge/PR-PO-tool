import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getPRApprovalLevels, getRequiredQuotes } from '../../lib/approvalEngine'
import { generatePRSummary } from '../../lib/claude'
import { EXPENSE_NATURES, validateAllocations, primaryAllocation } from '../../lib/donorData'
import { quotesValidity, advanceValidity, breakdownTotals, getFiscalYearPrefix } from '../../lib/formCalc'
import VendorSelector from './VendorSelector'
import QuoteRows from './QuoteRows'
import AdvanceTable from './AdvanceTable'
import DonorAllocations from '../shared/DonorAllocations'
import AmountBreakdown from '../shared/AmountBreakdown'

// TODO(finance): category list is pending final input from the Finance team.
const CATEGORIES = [
  'Travel Fare', 'Lodging and Boarding', 'Food', 'Bike Fare',
  'Consultant Fee', 'Professional Fee', 'Retainership / Consultancy',
  'Legal Fees', 'Courier', 'Service', 'Staff Welfare', 'Filing Fees',
  'Furniture and Fixtures', 'Housekeeping', 'Leasehold Improvements',
  'Medicine', 'Relocation Allowance', 'Repairs and Maintenance',
  'Subscription / Software', 'Other',
]
const FREQUENCIES = ['One-time', 'Monthly', 'Quarterly', 'Annually']

const PR_MIN = 25000
const PR_CONTRACT_THRESHOLD = 2500000  // 25 lacs

async function generatePRNumber() {
  const fy = getFiscalYearPrefix()
  const { count } = await supabase.from('purchase_requests').select('id', { count: 'exact', head: true }).like('pr_number', `${fy}-PR-%`)
  return `${fy}-PR-07-${((count || 0) + 1).toString().padStart(4, '0')}`
}

function StepIndicator({ current, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600,
            background: i < current ? '#16A34A' : i === current ? '#8C3225' : '#E5E7EB',
            color: i <= current ? '#FFFFFF' : '#6B7280',
          }}>
            {i < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && <div style={{ width: '36px', height: '1px', background: i < current ? '#16A34A' : '#E5E7EB' }} />}
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

function sel(value, onChange, options, placeholder) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
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
  const isEdit = !!existingPR
  const [step, setStep]       = useState(0)
  const [errors, setErrors]   = useState({})
  const [saving, setSaving]   = useState(false)
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
  const [category, setCategory]     = useState(existingPR?.category || '')
  const [breakdown, setBreakdown]   = useState({
    base:       existingPR?.base_amount != null ? String(existingPR.base_amount) : '',
    tax:        existingPR?.tax_amount != null ? String(existingPR.tax_amount) : (existingPR?.gst_amount != null ? String(existingPR.gst_amount) : ''),
    incidental: existingPR?.incidental_amount != null ? String(existingPR.incidental_amount) : '',
  })
  const [purpose, setPurpose]         = useState(existingPR?.purpose || '')
  const [isRecurring, setIsRecurring] = useState(existingPR?.is_recurring || false)
  const [frequency, setFrequency]     = useState(existingPR?.recurring_frequency || '')

  // ── Section 3: Quotes & Advance ──
  const [quoteState, setQuoteState] = useState({
    quotes: existingPR?.quotes || (existingPR?.quote_paths || []).map(p => ({ vendor_name: '', amount: '', quote_path: p, selected: false })),
    singleSource: !!existingPR?.single_source_justification,
    singleSourceJustification: existingPR?.single_source_justification || '',
  })
  const [advanceState, setAdvanceState] = useState({
    advancePercent: existingPR?.advance_percent != null ? String(existingPR.advance_percent) : '',
    flEmailAck: existingPR?.advance_fl_email_ack || false,
  })

  const { total: numericAmount } = breakdownTotals(breakdown)
  const requiredQuotes  = numericAmount >= PR_MIN ? getRequiredQuotes(numericAmount) : 0
  const approvalLevels  = numericAmount >= PR_MIN ? getPRApprovalLevels(numericAmount) : []
  const needsContract   = numericAmount >= PR_CONTRACT_THRESHOLD
  const belowThreshold  = numericAmount > 0 && numericAmount < PR_MIN
  const advFlags        = advanceValidity(advanceState)

  const STEPS = ['Program & Donor', 'Purchase Details', 'Review']

  function handleVendorSelect(id, v) { setVendorId(id); setVendorData(v) }

  function validateStep(s) {
    const e = {}
    if (s === 0) {
      if (budgeted === null) e.budgeted = 'Please indicate whether this is budgeted'
      if (!expenseType)      e.expenseType = 'Required'
      if (!validateAllocations(allocations).valid) e.allocations = 'Donor allocations must be complete and total exactly 100%'
    }
    if (s === 1) {
      if (!vendorId) e.vendorId = 'Please select a vendor'
      if (!category) e.category = 'Required'
      if (!breakdownTotals(breakdown).valid) e.amount = 'Enter a base amount and tax'
      if (numericAmount > 0 && numericAmount < PR_MIN)
        e.amount = `Purchases under ₹25,000 don't need a PR — submit as an expense claim instead.`
      if (!purpose.trim()) e.purpose = 'Required'
      if (isRecurring && !frequency) e.frequency = 'Select a frequency'
      if (!quotesValidity(quoteState, requiredQuotes).valid) {
        e.quotes = quoteState.singleSource
          ? 'You must explain why only one vendor is available, and attach that quotation.'
          : `Upload ${requiredQuotes} quotes and mark the selected vendor.`
      }
      if (!advFlags.valid) {
        e.advance = advFlags.requiresFLEmail
          ? 'Confirm Functional Leader email approval for the 100% advance.'
          : 'Enter a valid advance percentage (0–100).'
      }
    }
    return e
  }

  function nextStep() {
    const e = validateStep(step)
    setErrors(e)
    if (step === 1 && belowThreshold) { setShowBelowBlock(true); return }
    if (Object.keys(e).length) return
    setStep(s => s + 1)
  }

  async function handleSubmit() {
    setSaving(true); setSaveError(null)
    try {
      const prNumber = isEdit ? existingPR.pr_number : await generatePRNumber()
      const now = new Date().toISOString()
      const bd = breakdownTotals(breakdown)
      const primary = primaryAllocation(allocations) || {}
      const cleanQuotes = (quoteState.quotes || []).filter(q => q.quote_path || q.vendor_name || q.amount)

      const payload = {
        pr_number:                 prNumber,
        vendor_id:                 vendorId,
        requested_by:              user.email,
        amount:                    bd.total,
        base_amount:               bd.base,
        tax_amount:                bd.tax,
        gst_amount:                bd.tax,               // mirror for back-compat
        incidental_amount:         bd.incidental,
        budgeted,
        category,
        expense_type:              expenseType,
        entity:                    primary.entity || null,
        donor_name:                primary.donor || null,
        program:                   primary.program || null,
        subprogram:                primary.subprogram || null,
        donor_allocations:         allocations,
        purpose:                   purpose.trim(),
        is_recurring:              isRecurring,
        recurring_frequency:       isRecurring ? frequency : null,
        quotes:                    cleanQuotes,
        quote_paths:               cleanQuotes.map(q => q.quote_path).filter(Boolean),
        single_source_justification: quoteState.singleSource ? quoteState.singleSourceJustification.trim() : null,
        advance_percent:           advFlags.advance,
        after_delivery_percent:    advFlags.afterDelivery,
        advance_fl_email_ack:      advFlags.requiresFLEmail ? !!advanceState.flEmailAck : false,
        status:                    'submitted',
        submitted_at:              now,
      }

      let prId
      if (isEdit) {
        const { data, error } = await supabase.from('purchase_requests').update({ ...payload, rejection_reason: null }).eq('id', existingPR.id).select().single()
        if (error) throw error
        prId = data.id
        await supabase.from('pr_approvals').delete().eq('pr_id', prId)
      } else {
        const { data, error } = await supabase.from('purchase_requests').insert(payload).select().single()
        if (error) throw error
        prId = data.id
      }

      // AI summary
      const vd = vendorData || (await supabase.from('vendors').select('org_name').eq('id', vendorId).single()).data
      const aiSummary = await generatePRSummary(
        { amount: bd.total, purpose, category, entity: primary.entity, donor_name: primary.donor, expense_type: expenseType, is_recurring: isRecurring, recurring_frequency: frequency },
        vd
      )
      if (aiSummary) await supabase.from('purchase_requests').update({ ai_summary: aiSummary }).eq('id', prId)

      // Approval records per policy matrix
      const levels = getPRApprovalLevels(bd.total)
      const approvalRecords = levels.map((l, idx) => ({
        pr_id:          prId,
        approver_level: l.level,
        approver_name:  l.label,
        approver_email: '',
        status:         idx === 0 ? 'pending' : 'waiting',
      }))
      await supabase.from('pr_approvals').insert(approvalRecords)

      // Notify FL (level 1 approver)
      const advNote = advFlags.requiresFLEmail ? ' — 100% ADVANCE: email approval required.' : ''
      await supabase.from('expense_notifications').insert({
        recipient_id: 'finance1@test.com',
        type: 'pr_submitted',
        message: `New PR ${prNumber} for ₹${bd.total.toLocaleString('en-IN')} (${category}) requires Functional Leader approval.${advNote}`,
      }).catch(() => {})

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
            onClick={() => { setBreakdown({ base: '', tax: '', incidental: '' }); setShowBelowBlock(false) }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '13px', color: '#8C3225', cursor: 'pointer', padding: 0 }}>Back</button>
        <span style={{ color: '#9CA3AF' }}>/</span>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: 0 }}>
          {isEdit ? 'Edit Purchase Request' : 'New Purchase Request'}
        </h2>
      </div>

      <StepIndicator current={step} total={STEPS.length} />
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1F36', marginBottom: '20px' }}>{STEPS[step]}</div>

      {/* ── Section 1: Program & Donor Details ── */}
      {step === 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px' }}>
          <Field label="Budgeted?" error={errors.budgeted} required hint="Is this spend within an approved budget line?">
            <YesNoToggle value={budgeted} onChange={setBudgeted} />
          </Field>

          <Field label="Expense Nature" error={errors.expenseType} required hint="Revenue vs capital vs programme classification">
            {sel(expenseType, setExpenseType, EXPENSE_NATURES, 'Select nature…')}
          </Field>

          <Field label="Donor / Programme Allocation" error={errors.allocations} required hint="Split this spend across donors / programmes — must total 100%">
            <DonorAllocations value={allocations} onChange={setAllocations} error={errors.allocations} />
          </Field>
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

          <Field label="Category" error={errors.category} required>
            {sel(category, setCategory, CATEGORIES, 'Select category…')}
          </Field>

          {/* Amount breakdown: base + tax (mandatory) + incidentals (optional) */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
              Amount (INR)<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
            </label>
            <AmountBreakdown value={breakdown} onChange={setBreakdown} errors={errors.amount ? { base: errors.amount } : {}} />
          </div>

          {numericAmount >= PR_MIN && (
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '16px', background: '#F9FAFB', borderRadius: '4px', padding: '8px 12px' }}>
              Approval route: {approvalLevels.map(l => l.label).join(' → ')} &nbsp;·&nbsp; {requiredQuotes} quote{requiredQuotes > 1 ? 's' : ''} required
            </div>
          )}

          {needsContract && (
            <PolicyBanner type="error">
              <strong>Contract Required:</strong> This purchase exceeds ₹25 lacs. A signed contract must be in place before goods or services are delivered. Contact accounts@thenudge.org for the contracting process. A vendor selection document with selection criteria is also required.
            </PolicyBanner>
          )}

          <Field label="Purpose / Description" error={errors.purpose} required>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
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
              {sel(frequency, setFrequency, FREQUENCIES, 'Select frequency…')}
            </Field>
          )}
        </div>

        {/* Quotes & Advance — reveals once the core purchase details above are filled */}
        {vendorId && category && breakdownTotals(breakdown).valid && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px' }}>
              <PolicyBanner type="info">
                <strong>Policy requirement:</strong> {requiredQuotes} quote{requiredQuotes > 1 ? 's are' : ' is'} required for this purchase (₹{numericAmount.toLocaleString('en-IN')}). Quotes ensure the organisation gets the best price.
              </PolicyBanner>
              <QuoteRows value={quoteState} onChange={setQuoteState} requiredQuotes={requiredQuotes} error={errors.quotes} />
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '24px' }}>
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
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px' }}>Summary</div>
            {[
              ['Vendor',        vendorData?.org_name || vendorId],
              ['Budgeted',      budgeted === null ? '—' : budgeted ? 'Budgeted' : 'Not Budgeted'],
              ['Expense Nature', expenseType],
              ['Category',      category],
              ['Base Amount',   `₹${(Number(breakdown.base) || 0).toLocaleString('en-IN')}`],
              ['Tax (GST)',     `₹${(Number(breakdown.tax) || 0).toLocaleString('en-IN')}`],
              (Number(breakdown.incidental) || 0) > 0 ? ['Incidentals', `₹${Number(breakdown.incidental).toLocaleString('en-IN')}`] : null,
              ['Total Amount',  `₹${numericAmount.toLocaleString('en-IN')}`],
              ['Purpose',       purpose],
              isRecurring ? ['Recurring', frequency || 'Yes'] : null,
              ['Advance Split', `${advFlags.advance}% advance · ${advFlags.afterDelivery}% after delivery`],
              quoteState.singleSource
                ? ['Quotes', `Single source — ${quoteState.singleSourceJustification.substring(0, 60)}…`]
                : ['Quotes', `${quotesValidity(quoteState, requiredQuotes).uploaded} of ${requiredQuotes} uploaded`],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: '#9CA3AF', width: '140px', flexShrink: 0, fontSize: '12px' }}>{label}</span>
                <span style={{ color: '#1A1F36', fontWeight: label === 'Total Amount' ? 700 : 400 }}>{val}</span>
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
            </PolicyBanner>
          )}
          {advFlags.flaggedOver30 && !advFlags.requiresFLEmail && (
            <PolicyBanner type="warning">
              <strong>Advance over 30%:</strong> This advance ({advFlags.advance}%) exceeds the guideline and may attract additional scrutiny.
            </PolicyBanner>
          )}

          <div style={{ background: '#fdf0ed', border: '1px solid #f9c5b7', borderRadius: '6px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c2d12', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Approval Route (per Procurement Policy v3.0)</div>
            {approvalLevels.map((l, i) => (
              <div key={l.level} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: i < approvalLevels.length - 1 ? '8px' : 0 }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#8C3225', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{l.level}</div>
                <span style={{ fontSize: '13px', color: '#7c2d12', fontWeight: 500 }}>{l.label}</span>
              </div>
            ))}
            <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '10px' }}>
              Quotes required: {requiredQuotes} · {quoteState.singleSource ? 'Single source justification provided' : `${quotesValidity(quoteState, requiredQuotes).uploaded} uploaded`}
            </div>
          </div>

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
        </div>
      )}

      {step === STEPS.length - 1 && (
        <button
          onClick={() => setStep(s => s - 1)}
          style={{ marginTop: '12px', height: '38px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
        >
          ← Edit
        </button>
      )}
    </div>
  )
}
