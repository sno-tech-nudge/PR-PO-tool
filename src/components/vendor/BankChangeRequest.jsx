import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/

export default function BankChangeRequest({ vendor, user, onBack, onSubmitted }) {
  const [f, setF] = useState({
    beneficiary_name: vendor.beneficiary_name || '',
    account_number: vendor.account_number || '',
    ifsc_code: vendor.ifsc_code || '',
    bank_name: vendor.bank_name || '',
    branch: vendor.branch || '',
  })
  const [errors, setErrors]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [ifscLooking, setIfscLooking] = useState(false)

  function set(field) { return e => setF(prev => ({ ...prev, [field]: e.target.value })) }

  async function lookupIFSC() {
    const code = f.ifsc_code.toUpperCase().trim()
    if (!IFSC_RE.test(code)) return
    setIfscLooking(true)
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${code}`)
      if (res.ok) {
        const data = await res.json()
        setF(prev => ({ ...prev, bank_name: data.BANK || prev.bank_name, branch: data.BRANCH || prev.branch }))
      }
    } catch (err) {
      console.error('IFSC lookup failed:', err)
    }
    setIfscLooking(false)
  }

  function validate() {
    const e = {}
    if (!f.beneficiary_name.trim()) e.beneficiary_name = 'Required'
    if (!f.account_number.trim())   e.account_number = 'Required'
    if (!IFSC_RE.test(f.ifsc_code.toUpperCase().trim())) e.ifsc_code = 'Invalid IFSC format'
    if (!f.bank_name.trim())        e.bank_name = 'Required'
    if (!f.branch.trim())           e.branch = 'Required'
    const unchanged = (
      f.beneficiary_name.trim() === vendor.beneficiary_name &&
      f.account_number.trim() === vendor.account_number &&
      f.ifsc_code.toUpperCase().trim() === vendor.ifsc_code
    )
    if (unchanged) e.general = 'No changes detected in bank details.'
    return e
  }

  async function handleSubmit() {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true); setSaveError(null)
    try {
      const { error } = await supabase.from('vendor_bank_change_log').insert({
        vendor_id: vendor.id,
        requested_by: user.email,
        old_account_number: vendor.account_number,
        new_account_number: f.account_number.trim(),
        old_ifsc_code: vendor.ifsc_code,
        new_ifsc_code: f.ifsc_code.toUpperCase().trim(),
        old_bank_name: vendor.bank_name,
        new_bank_name: f.bank_name.trim(),
        status: 'pending',
      })
      if (error) throw error
      // TODO(auth): recipient_id is a single hardcoded test account — once
      // team_members exists (see src/lib/auth.js), notify every finance
      // team member via getFinanceEmails() instead of one fixed address.
      try {
        await supabase.from('expense_notifications').insert({
          recipient_id: 'finance1@test.com',
          type: 'bank_change_request',
          message: `Bank detail change requested for vendor "${vendor.org_name}" (${vendor.vendor_id}). Please review in Vendor Management.`,
          related_type: 'vendor',
          related_id: vendor.id,
        })
      } catch { /* non-blocking — the change request is already saved above */ }
      onSubmitted()
    } catch (err) {
      setSaveError(err.message || 'Failed to submit request.')
    }
    setSaving(false)
  }

  const inp = (field, placeholder, opts = {}) => (
    <input
      type="text"
      value={f[field]}
      onChange={set(field)}
      onBlur={opts.onBlur}
      placeholder={placeholder}
      style={{
        width: '100%', height: '38px', border: `1px solid ${errors[field] ? '#EF4444' : '#D1D5DB'}`,
        borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#1A1F36',
        background: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
        fontFamily: opts.mono ? 'monospace' : 'inherit',
      }}
    />
  )

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '13px', color: '#8C3225', cursor: 'pointer', padding: 0 }}>Back</button>
        <span style={{ color: '#9CA3AF' }}>/</span>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F36', margin: 0 }}>Request Bank Detail Change</h2>
      </div>

      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '4px', padding: '12px 14px', marginBottom: '20px', fontSize: '12px', color: '#92400E' }}>
        Bank detail changes require re-approval by Finance before taking effect. Please fill in the new details below.
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Bank Details (for reference)</div>
        {[['Beneficiary', vendor.beneficiary_name], ['Account No.', vendor.account_number], ['IFSC', vendor.ifsc_code], ['Bank', vendor.bank_name], ['Branch', vendor.branch]].map(([l, v]) => (
          <div key={l} style={{ display: 'flex', gap: '12px', marginBottom: '6px', fontSize: '12px' }}>
            <span style={{ color: '#9CA3AF', width: '100px', flexShrink: 0 }}>{l}</span>
            <span style={{ color: '#374151', fontFamily: l === 'Account No.' || l === 'IFSC' ? 'monospace' : 'inherit' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Bank Details</div>
        {[
          ['Beneficiary Name', 'beneficiary_name', 'Name as on new account'],
          ['Account Number', 'account_number', '', { mono: true }],
          ['IFSC Code', 'ifsc_code', 'SBIN0001234', { mono: true, onBlur: lookupIFSC }],
          ['Bank Name', 'bank_name', 'e.g. State Bank of India'],
          ['Branch', 'branch', 'e.g. MG Road, Bangalore'],
        ].map(([label, field, placeholder, opts]) => (
          <div key={field} style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>{label}</label>
            {inp(field, placeholder, opts || {})}
            {errors[field] && <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '3px' }}>{errors[field]}</div>}
          </div>
        ))}
        {ifscLooking && <div style={{ fontSize: '11px', color: '#6B7280' }}>Looking up IFSC…</div>}
      </div>

      {(errors.general || saveError) && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#B91C1C' }}>
          {errors.general || saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{ height: '40px', padding: '0 24px', background: saving ? '#9CA3AF' : '#1565C0', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
        >
          {saving ? 'Submitting…' : 'Submit Change Request'}
        </button>
        <button onClick={onBack} style={{ height: '40px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '14px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
