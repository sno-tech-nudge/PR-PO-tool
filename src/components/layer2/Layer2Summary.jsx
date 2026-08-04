import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const PURPOSE_LABELS = {
  internal: 'Internal team meeting or work',
  field: 'Field programme or beneficiary visit',
  donor: 'Donor or client engagement',
  office: 'Office or admin',
}

const EXPENSE_TYPE_LABELS = {
  just_me: 'Just me',
  my_team: 'My team',
  client_donor: 'Client or donor',
  field_visit: 'Field visit',
}

const REIMBURSE_LABELS = {
  bank_transfer: 'Bank transfer',
  petty_cash: 'Petty cash',
}

export default function Layer2Summary({ formData, onSaved, onAddAnother, onBack }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const rows = [
    { label: 'Amount', value: formData.amount ? `₹${Number(formData.amount).toLocaleString('en-IN')}` : '—' },
    { label: 'Vendor', value: formData.vendor || '—' },
    { label: 'Date', value: formData.date || '—' },
    { label: 'Category', value: formData.category || '—' },
    { label: 'Who it was for', value: EXPENSE_TYPE_LABELS[formData.expense_type] || formData.expense_type || '—' },
    formData.attendee_count > 1 && { label: 'Number of people', value: formData.attendee_count },
    formData.per_person_amount && { label: 'Per person', value: `₹${Number(formData.per_person_amount).toLocaleString('en-IN')}` },
    { label: 'Purpose', value: PURPOSE_LABELS[formData.purpose_type] || formData.purpose_type || '—' },
    formData.description && { label: 'Description', value: formData.description },
    { label: 'Trip', value: formData.trip_related ? (formData.trip_name || 'Yes') : 'No' },
    formData.prior_approval_taken != null && { label: 'Prior approval', value: formData.prior_approval_taken ? (formData.prior_approval_reference || 'Yes') : 'No' },
    { label: 'Brand', value: formData.brand || '—' },
    { label: 'Reimbursement', value: REIMBURSE_LABELS[formData.reimbursement_type] || formData.reimbursement_type || '—' },
  ].filter(Boolean)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('expense_details').insert({
        amount: formData.amount ?? null,
        vendor: formData.vendor ?? null,
        date: formData.date ?? null,
        category: formData.category ?? null,
        expense_type: formData.expense_type ?? null,
        attendee_count: formData.attendee_count ?? null,
        per_person_amount: formData.per_person_amount ?? null,
        attendee_names: formData.attendee_names ?? null,
        purpose_type: formData.purpose_type ?? null,
        description: formData.description ?? null,
        trip_related: formData.trip_related ?? false,
        trip_name: formData.trip_name ?? null,
        prior_approval_taken: formData.prior_approval_taken ?? null,
        prior_approval_reference: formData.prior_approval_reference ?? null,
        brand: formData.brand ?? null,
        reimbursement_type: formData.reimbursement_type ?? null,
        payment_method: formData.payment_method ?? null,
        submitted_at: new Date().toISOString(),
      })
      if (err) throw err
      onSaved()
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '13px', color: '#4A4A4A', padding: 0, marginBottom: '20px', display: 'block',
        }}
      >
        Back
      </button>

      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '20px' }}>
        Review your expense
      </div>

      <div style={{ border: '1px solid #E8E8E8', borderRadius: '4px', marginBottom: '20px', overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0 16px', minHeight: '56px',
              background: i % 2 === 0 ? '#FFFFFF' : '#F7F7F7',
              borderBottom: i < rows.length - 1 ? '1px solid #E8E8E8' : 'none',
            }}
          >
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>{row.label}</span>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', textAlign: 'right', maxWidth: '60%' }}>
              {String(row.value)}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ fontSize: '13px', color: '#DC2626', marginBottom: '12px' }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', fontSize: '14px', fontWeight: 500, cursor: saving ? 'default' : 'pointer',
            borderRadius: '4px', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save expense'}
        </button>
        <button
          onClick={onAddAnother}
          style={{
            width: '100%', height: '48px', background: '#FFFFFF', color: '#1A1A1A',
            border: '1px solid #8C3225', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', borderRadius: '4px',
          }}
        >
          Add another expense
        </button>
      </div>
    </div>
  )
}
