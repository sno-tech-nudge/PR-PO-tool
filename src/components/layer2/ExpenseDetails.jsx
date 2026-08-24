import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { suggestCategory } from '../../lib/claude'
import { ENTITIES, EXPENSE_NATURES, getPrograms, getSubprograms, getDonors } from '../../lib/donorData'
import AmountInput from '../shared/AmountInput'

const CATEGORIES = [
  'Travel Fare', 'Lodging and Boarding', 'Food', 'Bike Fare',
  'Consultant Fee', 'Professional Fee', 'Retainership / Consultancy',
  'Legal Fees', 'Courier', 'Service', 'Staff Welfare', 'Filing Fees',
  'Furniture and Fixtures', 'Housekeeping', 'Leasehold Improvements',
  'Medicine', 'Relocation Allowance', 'Repairs and Maintenance',
  'Subscription / Software', 'Learning and Development', 'Other',
]

const PAYMENT_MODES = ['Self - Cash/Card', 'Self - UPI', 'Company Card', 'Advance Adjustment']

function toInputDate(dateStr) {
  if (!dateStr) return ''
  const ddmm = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  const dash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  return ''
}

function fromInputDate(val) {
  if (!val) return ''
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return val
}

export default function ExpenseDetails({ layer1Data, existingExpense = null, defaultReportId = '', user, onSaved, onBack }) {
  const isEdit = !!existingExpense
  const [reportId, setReportId] = useState(existingExpense?.report_id || defaultReportId || '')
  const [reportOptions, setReportOptions] = useState([])
  const [amount, setAmount] = useState(existingExpense?.amount != null ? String(existingExpense.amount) : (layer1Data?.amount != null ? String(layer1Data.amount) : ''))
  const [vendor, setVendor] = useState(existingExpense?.vendor ?? layer1Data?.vendor ?? '')
  const [merchantOptions, setMerchantOptions] = useState([])
  const [date, setDate] = useState(existingExpense?.date ?? layer1Data?.date ?? '')
  const [category, setCategory] = useState(existingExpense?.category ?? layer1Data?.category ?? '')
  const [expenseType, setExpenseType] = useState(existingExpense?.expense_type || 'just_me')
  const [invoiceNumber, setInvoiceNumber] = useState(existingExpense?.invoice_number ?? layer1Data?.invoice_number ?? '')
  const [gstin, setGstin] = useState(existingExpense?.gstin ?? layer1Data?.gstin ?? '')
  const [note, setNote] = useState(existingExpense?.description ?? '')
  const [reimbursable, setReimbursable] = useState(existingExpense?.reimbursable ?? true)
  const [paymentMode, setPaymentMode] = useState(existingExpense?.payment_method || layer1Data?.payment_method || PAYMENT_MODES[0])
  const [suggestedCategory, setSuggestedCategory] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showAdditional, setShowAdditional] = useState(false)

  // Itemize — split one expense's amount across sub-line-items. The top-level
  // `amount` stays the source of truth everywhere else in the app (reports,
  // exports, policy checks); itemizing just derives it as a sum instead of a
  // typed value, so nothing downstream needs to change.
  const [itemized, setItemized] = useState(Array.isArray(existingExpense?.itemized_lines) && existingExpense.itemized_lines.length > 0)
  const [itemLines, setItemLines] = useState(
    Array.isArray(existingExpense?.itemized_lines) && existingExpense.itemized_lines.length > 0
      ? existingExpense.itemized_lines
      : [{ category: '', amount: '' }, { category: '', amount: '' }]
  )

  const [entity, setEntity] = useState(existingExpense?.entity || '')
  const [program, setProgram] = useState(existingExpense?.program || '')
  const [subprogram, setSubprogram] = useState(existingExpense?.subprogram || '')
  const [natureOfExpense, setNatureOfExpense] = useState(existingExpense?.expense_nature || '')
  const [poNumber, setPoNumber] = useState(existingExpense?.po_number || '')
  const [donorName, setDonorName] = useState(existingExpense?.donor_name || '')
  const [subCategory, setSubCategory] = useState(existingExpense?.sub_category || '')
  const [poPdfLink, setPoPdfLink] = useState(existingExpense?.po_pdf_link || '')
  const [cardNo, setCardNo] = useState(existingExpense?.card_no || '')
  const [paidTo, setPaidTo] = useState(existingExpense?.paid_to || '')
  const [vrPdfLink, setVrPdfLink] = useState(existingExpense?.vr_pdf_link || '')
  const [subGrantingCategory, setSubGrantingCategory] = useState(existingExpense?.sub_granting_category || '')
  const [referenceNumber, setReferenceNumber] = useState(existingExpense?.reference_number || '')

  const programs = getPrograms(entity)
  const subprograms = getSubprograms(entity, program)
  const donors = getDonors(entity, program, subprogram)

  const descriptionRequired = category === 'Other'
  const itemTotal = itemLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0)
  const effectiveAmount = itemized ? itemTotal : (parseFloat(amount) || 0)

  useEffect(() => {
    const v = layer1Data?.vendor
    if (!v || isEdit) return
    suggestCategory(v).then(cat => {
      if (cat) {
        setSuggestedCategory(cat)
        setCategory(prev => prev || cat)
      }
    })
    applyVendorHistory(v)
  }, [])

  useEffect(() => {
    async function loadMerchants() {
      const { data } = await supabase
        .from('expense_details')
        .select('vendor')
        .eq('user_email', user?.email ?? '')
        .not('vendor', 'is', null)
      const unique = [...new Set((data || []).map(r => r.vendor).filter(Boolean))]
      setMerchantOptions(unique)
    }
    loadMerchants()
  }, [])

  useEffect(() => {
    async function loadReports() {
      const { data } = await supabase
        .from('expense_reports')
        .select('id, report_reference, brand, status')
        .eq('employee_email', user?.email ?? '')
        .order('created_at', { ascending: false })
      setReportOptions(data || [])
    }
    loadReports()
  }, [])

  // Selecting a report is a convenience link, not a hard attachment — it
  // tags this expense with that report for traceability and reuses its
  // Entity so recurring reports don't need reclassifying every time.
  function handleReportSelect(id) {
    setReportId(id)
    const report = reportOptions.find(r => r.id === id)
    if (report?.brand && !entity) setEntity(report.brand)
  }

  // Once this vendor has been classified before (entity/donor/etc. filled in
  // on a past expense), reuse that classification instead of asking again —
  // same "fill once, remember everywhere" pattern used for PR recurring
  // details. Only fills fields that are still empty, and never overrides an
  // existing expense being edited.
  async function applyVendorHistory(vendorName) {
    if (!vendorName || isEdit || entity) return
    const { data } = await supabase
      .from('expense_details')
      .select('entity, program, subprogram, donor_name, expense_nature, category')
      .ilike('vendor', vendorName)
      .eq('user_email', user?.email ?? '')
      .not('entity', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return
    setEntity(data.entity || '')
    setProgram(data.program || '')
    setSubprogram(data.subprogram || '')
    setDonorName(data.donor_name || '')
    setNatureOfExpense(data.expense_nature || '')
    setCategory(prev => prev || data.category || '')
  }

  function addItemLine() {
    setItemLines(lines => [...lines, { category: '', amount: '' }])
  }

  function removeItemLine(idx) {
    setItemLines(lines => lines.filter((_, i) => i !== idx))
  }

  function updateItemLine(idx, field, value) {
    setItemLines(lines => lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  function validate() {
    const missing = []
    if (!date) missing.push('Expense Date')
    if (!vendor) missing.push('Merchant')
    if (!category) missing.push('Category')
    if (!effectiveAmount) missing.push('Amount')
    if (!paymentMode) missing.push('Payment Mode')
    if (!entity) missing.push('Entity')
    if (descriptionRequired && !note) missing.push('Description (this expense requires a description)')
    return missing
  }

  async function handleSave() {
    const missing = validate()
    if (missing.length > 0) {
      setError(`Please fill in required fields: ${missing.join(', ')}`)
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      report_id: reportId || null,
      amount: effectiveAmount || null,
      vendor: vendor || null,
      date: date || null,
      category: category || null,
      expense_type: expenseType,
      invoice_number: invoiceNumber || null,
      gstin: gstin || null,
      description: note || null,
      reimbursable,
      payment_method: paymentMode || null,
      entity: entity || null,
      program: program || null,
      subprogram: subprogram || null,
      donor_name: donorName || null,
      expense_nature: natureOfExpense || null,
      reference_number: referenceNumber || null,
      card_no: cardNo || null,
      po_number: poNumber || null,
      sub_category: subCategory || null,
      po_pdf_link: poPdfLink || null,
      paid_to: paidTo || null,
      vr_pdf_link: vrPdfLink || null,
      sub_granting_category: subGrantingCategory || null,
      itemized_lines: itemized ? itemLines.filter(l => l.category || l.amount) : null,
    }

    const { error: err } = isEdit
      ? await supabase.from('expense_details').update(payload).eq('id', existingExpense.id)
      : await supabase.from('expense_details').insert({
          ...payload,
          capture_id: layer1Data?.capture_id ?? null,
          submitted_at: new Date().toISOString(),
          user_email: user?.email ?? null,
          status: 'saved',
        })
    if (err) {
      console.error('Expense save error:', err)
      setError(`Save failed: ${err.message}`)
      setSaving(false)
      return
    }
    onSaved()
  }

  const inputStyle = {
    width: '100%', height: '44px', border: '1px solid #E8E8E8',
    borderRadius: '4px', padding: '0 12px', fontSize: '14px',
    color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
    background: '#FFFFFF', fontFamily: 'inherit',
  }

  const labelStyle = {
    fontSize: '12px', color: '#6B6B6B', marginBottom: '6px', display: 'block',
  }

  const fieldWrap = { marginBottom: '16px' }
  const required = <span style={{ color: '#DC2626' }}> *</span>

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%', paddingBottom: '100px' }}>
      {/* Back */}
      <div
        onClick={onBack}
        style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', textDecoration: 'underline', marginBottom: '20px' }}
      >
        ← Back
      </div>

      {/* Header */}
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Expense Details</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '16px' }}>
        {isEdit ? 'Edit expense' : 'Quick details before saving'}
      </div>
      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '20px' }} />

      {/* Report — optional link to an existing report by this employee */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Report</label>
        <select
          value={reportId}
          onChange={e => handleReportSelect(e.target.value)}
          style={{ ...inputStyle, paddingLeft: '10px' }}
        >
          <option value="">No report selected</option>
          {reportOptions.map(r => (
            <option key={r.id} value={r.id}>{r.report_reference} {r.status ? `(${r.status})` : ''}</option>
          ))}
        </select>
      </div>

      {/* 1. Expense Date */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Expense Date{required}</label>
        <input
          type="date"
          value={toInputDate(date)}
          onChange={e => setDate(fromInputDate(e.target.value))}
          style={inputStyle}
        />
      </div>

      {/* 2. Merchant */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Merchant{required}</label>
        <input
          type="text"
          list="merchant-options"
          value={vendor}
          onChange={e => setVendor(e.target.value)}
          onBlur={() => applyVendorHistory(vendor)}
          placeholder="Select existing or type a new merchant"
          style={inputStyle}
        />
        <datalist id="merchant-options">
          {merchantOptions.map(m => <option key={m} value={m} />)}
        </datalist>
      </div>

      {/* 3. Category */}
      <div style={fieldWrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Category{required}</span>
          {suggestedCategory && category === suggestedCategory && (
            <span style={{ fontSize: '11px', color: '#6B6B6B' }}>Suggested</span>
          )}
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ ...inputStyle, paddingLeft: '10px' }}
        >
          <option value="">Select a category</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* 4. Amount + Itemize */}
      <div style={fieldWrap}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Amount{required}</label>
          <span
            onClick={() => setItemized(v => !v)}
            style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {itemized ? 'Remove itemization' : 'Itemize'}
          </span>
        </div>

        {!itemized && (
          <AmountInput value={amount} onChange={setAmount} inputStyle={{ height: inputStyle.height, fontSize: inputStyle.fontSize }} />
        )}

        {itemized && (
          <div>
            {itemLines.map((line, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <select
                  value={line.category}
                  onChange={e => updateItemLine(idx, 'category', e.target.value)}
                  style={{ ...inputStyle, flex: 2, paddingLeft: '10px' }}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <AmountInput
                  value={line.amount}
                  onChange={v => updateItemLine(idx, 'amount', v)}
                  style={{ flex: 1 }}
                  inputStyle={{ height: inputStyle.height, fontSize: inputStyle.fontSize }}
                />
                <div
                  onClick={() => removeItemLine(idx)}
                  style={{ fontSize: '12px', color: '#6B6B6B', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 4px' }}
                >
                  ✕
                </div>
              </div>
            ))}
            <div
              onClick={addItemLine}
              style={{ fontSize: '12px', color: '#4A4A4A', cursor: 'pointer', marginBottom: '8px' }}
            >
              + Add line item
            </div>
            <div style={{ fontSize: '13px', color: '#1A1A1A', fontWeight: 500 }}>
              Total: ₹{itemTotal.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* 5. Claim reimbursement */}
      <div style={{ ...fieldWrap, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          id="claim-reimbursement"
          checked={reimbursable}
          onChange={e => setReimbursable(e.target.checked)}
          style={{ width: '16px', height: '16px' }}
        />
        <label htmlFor="claim-reimbursement" style={{ fontSize: '13px', color: '#1A1A1A', cursor: 'pointer' }}>
          Claim reimbursement
        </label>
      </div>

      {/* 6. Payment Mode */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Payment Mode{required}</label>
        <select
          value={paymentMode}
          onChange={e => setPaymentMode(e.target.value)}
          style={{ ...inputStyle, paddingLeft: '10px' }}
        >
          {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* 7. Description */}
      <div style={fieldWrap}>
        <label style={labelStyle}>
          Description{descriptionRequired && required}
        </label>
        {descriptionRequired && (
          <div style={{ fontSize: '11px', color: '#8C3225', marginBottom: '6px' }}>
            this expense requires a description
          </div>
        )}
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Any additional context"
          style={inputStyle}
        />
      </div>

      {/* 8. Reference# */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Reference#</label>
        <input
          type="text"
          value={referenceNumber}
          onChange={e => setReferenceNumber(e.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 9. Entity */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Entity{required}</label>
        <select
          value={entity}
          onChange={e => { setEntity(e.target.value); setProgram(''); setSubprogram(''); setDonorName('') }}
          style={{ ...inputStyle, paddingLeft: '10px' }}
        >
          <option value="">Select entity…</option>
          {ENTITIES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {programs.length > 0 && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Programme</label>
          <select
            value={program}
            onChange={e => { setProgram(e.target.value); setSubprogram(''); setDonorName('') }}
            style={{ ...inputStyle, paddingLeft: '10px' }}
          >
            <option value="">Select programme…</option>
            {programs.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      )}

      {subprograms.length > 0 && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Sub-Programme</label>
          <select
            value={subprogram}
            onChange={e => { setSubprogram(e.target.value); setDonorName('') }}
            style={{ ...inputStyle, paddingLeft: '10px' }}
          >
            <option value="">Select sub-programme…</option>
            {subprograms.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      )}

      {/* 10. Nature of Expense */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Nature of Expense</label>
        <select
          value={natureOfExpense}
          onChange={e => setNatureOfExpense(e.target.value)}
          style={{ ...inputStyle, paddingLeft: '10px' }}
        >
          <option value="">Select nature…</option>
          {EXPENSE_NATURES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* 11. PO Number */}
      <div style={fieldWrap}>
        <label style={labelStyle}>PO Number</label>
        <input
          type="text"
          value={poNumber}
          onChange={e => setPoNumber(e.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 12. Donor */}
      {donors.length > 0 && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Donor</label>
          <select
            value={donorName}
            onChange={e => setDonorName(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '10px' }}
          >
            <option value="">Select donor…</option>
            {donors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      )}

      {/* 13. Sub Category */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Sub Category</label>
        <input
          type="text"
          value={subCategory}
          onChange={e => setSubCategory(e.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 14. PO Pdf link */}
      <div style={fieldWrap}>
        <label style={labelStyle}>PO Pdf link</label>
        <input
          type="text"
          value={poPdfLink}
          onChange={e => setPoPdfLink(e.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 15. Card Nos */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Card Nos</label>
        <input
          type="text"
          value={cardNo}
          onChange={e => setCardNo(e.target.value)}
          placeholder="If paid by company card"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 16. Paid To */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Paid To</label>
        <input
          type="text"
          value={paidTo}
          onChange={e => setPaidTo(e.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 17. VR PDF Link */}
      <div style={fieldWrap}>
        <label style={labelStyle}>VR PDF Link</label>
        <input
          type="text"
          value={vrPdfLink}
          onChange={e => setVrPdfLink(e.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 18. Sub Granting Category */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Sub Granting Category</label>
        <input
          type="text"
          value={subGrantingCategory}
          onChange={e => setSubGrantingCategory(e.target.value)}
          placeholder="Optional"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* 19. Invoice Number/Agreement Reference number */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Invoice Number/Agreement Reference number</label>
        <input
          type="text"
          value={invoiceNumber}
          onChange={e => setInvoiceNumber(e.target.value)}
          placeholder="If mentioned on receipt"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* Additional details — fields outside the standard list, collapsed by default */}
      <div style={{ marginBottom: '16px' }}>
        <div
          onClick={() => setShowAdditional(s => !s)}
          style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}
        >
          <span style={{ fontSize: '10px', transform: showAdditional ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
          Additional details
        </div>

        {showAdditional && (
          <div style={{ marginTop: '14px' }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Who was this for</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { key: 'just_me', label: 'Just me', sub: 'Personal expense' },
                  { key: 'my_team', label: 'Multiple people', sub: 'Team or group' },
                ].map(opt => (
                  <div
                    key={opt.key}
                    onClick={() => setExpenseType(opt.key)}
                    style={{
                      flex: 1, padding: '10px 12px', cursor: 'pointer',
                      border: `1.5px solid ${expenseType === opt.key ? '#1A1A1A' : '#E8E8E8'}`,
                      background: expenseType === opt.key ? '#F7F7F7' : '#FFFFFF',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#6B6B6B', marginTop: '2px' }}>{opt.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>GSTIN</label>
              <input
                type="text"
                value={gstin}
                onChange={e => setGstin(e.target.value)}
                placeholder="If mentioned on receipt"
                style={{ ...inputStyle, fontSize: '13px' }}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '13px', color: '#DC2626', marginBottom: '8px' }}>{error}</div>
      )}

      {/* Fixed bottom */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: '#FFFFFF', borderTop: '1px solid #E8E8E8', padding: '16px',
        }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', height: '48px',
              background: saving ? '#9CA3AF' : '#1A1A1A',
              color: '#FFFFFF', border: 'none',
              fontSize: '14px', fontWeight: 500,
              cursor: saving ? 'default' : 'pointer', borderRadius: '4px',
            }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  )
}
