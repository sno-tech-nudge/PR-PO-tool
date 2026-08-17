import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = [
  'Travel Fare', 'Lodging and Boarding', 'Food', 'Bike Fare',
  'Consultant Fee', 'Professional Fee', 'Retainership / Consultancy',
  'Legal Fees', 'Courier', 'Service', 'Staff Welfare', 'Filing Fees',
  'Furniture and Fixtures', 'Housekeeping', 'Leasehold Improvements',
  'Medicine', 'Relocation Allowance', 'Repairs and Maintenance',
  'Subscription / Software', 'Learning and Development', 'Other',
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
]

function blankRow() {
  return { date: '', vendor: '', category: '', amount: '', reimbursable: true, payment_method: '' }
}

// Zoho-style "Bulk Add Expenses" — a spreadsheet-row grid for logging several
// expenses at once, instead of going through the single-expense form each
// time. Saves straight to expense_details, same table/shape ExpenseDetails.jsx
// uses, just without the receipt/OCR/donor-classification fields — those stay
// editable afterwards via "Edit" in ExpenseSelector.
export default function BulkAddExpenses({ user, onSaved, onBack }) {
  const [rows, setRows] = useState(Array.from({ length: 5 }, blankRow))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function updateRow(i, patch) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows(prev => [...prev, blankRow()])
  }

  function removeRow(i) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  const filledRows = rows.filter(r => r.date || r.vendor || r.category || r.amount)

  async function handleSave() {
    if (filledRows.length === 0) return
    setSaving(true)
    setError(null)

    const payload = filledRows.map(r => ({
      date: r.date || null,
      vendor: r.vendor || null,
      category: r.category || null,
      amount: r.amount ? Number(r.amount) : null,
      payment_method: r.payment_method || null,
      reimbursable: r.reimbursable,
      expense_type: 'just_me',
      submitted_at: new Date().toISOString(),
      user_email: user?.email ?? null,
      status: 'saved',
    }))

    const { error: err } = await supabase.from('expense_details').insert(payload)
    if (err) {
      console.error('Bulk add error:', err)
      setError(`Save failed: ${err.message}`)
      setSaving(false)
      return
    }
    onSaved()
  }

  const inputStyle = {
    width: '100%', height: '38px', border: '1px solid #E5E7EB', borderRadius: '4px',
    padding: '0 10px', fontSize: '13px', color: '#1A1A1A', outline: 'none',
    boxSizing: 'border-box', background: '#FFFFFF', fontFamily: 'inherit',
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px 100px', width: '100%' }}>
      <div
        onClick={onBack}
        style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', textDecoration: 'underline', marginBottom: '20px' }}
      >
        ← Back
      </div>

      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Quick Add</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '20px' }}>
        Bulk add expenses
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              {['Date', 'Merchant', 'Category', 'Amount', 'Reimbursable', 'Payment Mode', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '8px' }}>
                  <input type="date" value={r.date} onChange={e => updateRow(i, { date: e.target.value })} style={inputStyle} />
                </td>
                <td style={{ padding: '8px' }}>
                  <input type="text" value={r.vendor} onChange={e => updateRow(i, { vendor: e.target.value })} placeholder="Who was this paid to" style={inputStyle} />
                </td>
                <td style={{ padding: '8px' }}>
                  <select value={r.category} onChange={e => updateRow(i, { category: e.target.value })} style={{ ...inputStyle, paddingLeft: '8px' }}>
                    <option value="">Select</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px' }}>
                  <input type="number" value={r.amount} onChange={e => updateRow(i, { amount: e.target.value })} placeholder="0.00" style={inputStyle} />
                </td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  <input type="checkbox" checked={r.reimbursable} onChange={e => updateRow(i, { reimbursable: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                </td>
                <td style={{ padding: '8px' }}>
                  <select value={r.payment_method} onChange={e => updateRow(i, { payment_method: e.target.value })} style={{ ...inputStyle, paddingLeft: '8px' }}>
                    <option value="">Select</option>
                    {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px' }}>
                  {rows.length > 1 && (
                    <span onClick={() => removeRow(i)} style={{ fontSize: '11px', color: '#B91C1C', cursor: 'pointer' }}>Remove</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        onClick={addRow}
        style={{ marginTop: '14px', fontSize: '13px', color: '#8C3225', cursor: 'pointer', fontWeight: 500 }}
      >
        + Add More Expenses
      </div>

      {error && (
        <div style={{ fontSize: '13px', color: '#DC2626', marginTop: '16px' }}>{error}</div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', gap: '10px', maxWidth: '960px', margin: '0 auto' }}>
          <button
            onClick={handleSave}
            disabled={saving || filledRows.length === 0}
            style={{
              height: '44px', padding: '0 28px', borderRadius: '4px', fontSize: '14px', fontWeight: 600,
              background: saving || filledRows.length === 0 ? '#9CA3AF' : '#8C3225', color: '#FFFFFF', border: 'none',
              cursor: saving || filledRows.length === 0 ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : `Save ${filledRows.length || ''} expense${filledRows.length === 1 ? '' : 's'}`}
          </button>
          <button
            onClick={onBack}
            style={{ height: '44px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '14px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
