import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { suggestCategory } from '../../lib/claude'

const CATEGORIES = [
  'Travel Fare', 'Lodging and Boarding', 'Food', 'Bike Fare',
  'Consultant Fee', 'Professional Fee', 'Retainership / Consultancy',
  'Legal Fees', 'Courier', 'Service', 'Staff Welfare', 'Filing Fees',
  'Furniture and Fixtures', 'Housekeeping', 'Leasehold Improvements',
  'Medicine', 'Relocation Allowance', 'Repairs and Maintenance',
  'Subscription / Software', 'Learning and Development', 'Other',
]

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

export default function ExpenseDetails({ layer1Data, user, onSaved, onBack }) {
  const [amount, setAmount] = useState(layer1Data?.amount != null ? String(layer1Data.amount) : '')
  const [vendor, setVendor] = useState(layer1Data?.vendor ?? '')
  const [date, setDate] = useState(layer1Data?.date ?? '')
  const [category, setCategory] = useState(layer1Data?.category ?? '')
  const [expenseType, setExpenseType] = useState('just_me')
  const [invoiceNumber, setInvoiceNumber] = useState(layer1Data?.invoice_number ?? '')
  const [gstin, setGstin] = useState(layer1Data?.gstin ?? '')
  const [note, setNote] = useState('')
  const [suggestedCategory, setSuggestedCategory] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const v = layer1Data?.vendor
    if (!v) return
    suggestCategory(v).then(cat => {
      if (cat) {
        setSuggestedCategory(cat)
        setCategory(prev => prev || cat)
      }
    })
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('expense_details').insert({
      amount: amount ? Number(amount) : null,
      vendor: vendor || null,
      date: date || null,
      category: category || null,
      expense_type: expenseType,
      invoice_number: invoiceNumber || null,
      gstin: gstin || null,
      description: note || null,
      capture_id: layer1Data?.capture_id ?? null,
      payment_method: layer1Data?.payment_method ?? null,
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
        Quick details before saving
      </div>
      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '20px' }} />

      {/* Amount */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Amount</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          style={inputStyle}
        />
      </div>

      {/* Vendor */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Vendor</label>
        <input
          type="text"
          value={vendor}
          onChange={e => setVendor(e.target.value)}
          placeholder="Who was this paid to"
          style={inputStyle}
        />
      </div>

      {/* Date */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Date</label>
        <input
          type="date"
          value={toInputDate(date)}
          onChange={e => setDate(fromInputDate(e.target.value))}
          style={inputStyle}
        />
      </div>

      {/* Category */}
      <div style={fieldWrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Category</span>
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

      {/* Who was this for (inline) */}
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

      {/* Invoice number */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Invoice number</label>
        <input
          type="text"
          value={invoiceNumber}
          onChange={e => setInvoiceNumber(e.target.value)}
          placeholder="If mentioned on receipt"
          style={{ ...inputStyle, fontSize: '13px' }}
        />
      </div>

      {/* GSTIN */}
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

      {/* Note */}
      <div style={fieldWrap}>
        <label style={labelStyle}>Note</label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Any additional context"
          style={inputStyle}
        />
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
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  )
}
