import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { generateReportReference } from '../../lib/reportReference'

export default function NewReportModal({ user, onCreated, onClose }) {
  const [reference] = useState(() => generateReportReference())
  const [businessPurpose, setBusinessPurpose] = useState('')
  const [durationStart, setDurationStart] = useState('')
  const [durationEnd, setDurationEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    if (!durationStart || !durationEnd) {
      setError('Please fill in the report duration.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('expense_reports')
      .insert({
        report_reference: reference,
        business_purpose: businessPurpose || null,
        duration_start: durationStart,
        duration_end: durationEnd,
        employee_email: user?.email ?? null,
        status: 'draft',
      })
      .select()
      .single()
    if (err) {
      setError(`Could not create report: ${err.message}`)
      setSaving(false)
      return
    }
    onCreated(data)
  }

  const inputStyle = {
    width: '100%', height: '44px', border: '1px solid #E8E8E8',
    borderRadius: '4px', padding: '0 12px', fontSize: '14px',
    color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
    background: '#FFFFFF', fontFamily: 'inherit',
  }

  const labelStyle = { fontSize: '13px', color: '#1A1A1A', fontWeight: 500, marginBottom: '8px', display: 'block' }
  const required = <span style={{ color: '#DC2626' }}> *</span>

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#FFFFFF', width: '100%', maxWidth: '440px', borderRadius: '6px', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #E8E8E8' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A' }}>New Report</div>
          <div
            onClick={onClose}
            style={{
              width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #E8E8E8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '14px', color: '#6B6B6B',
            }}
          >
            ✕
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Report Name{required}</label>
            <div style={{
              ...inputStyle, display: 'flex', alignItems: 'center',
              background: '#F7F7F7', color: '#6B6B6B',
            }}>
              {reference} — this field will be auto-generated
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Business Purpose</label>
            <textarea
              value={businessPurpose}
              onChange={e => setBusinessPurpose(e.target.value.slice(0, 500))}
              placeholder="Max 500 characters"
              rows={3}
              style={{
                ...inputStyle, height: 'auto', padding: '10px 12px',
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: '11px', color: '#6B6B6B', marginTop: '4px', textAlign: 'right' }}>
              {businessPurpose.length}/500
            </div>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={labelStyle}>Duration{required}</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="date"
                value={durationStart}
                onChange={e => setDurationStart(e.target.value)}
                style={inputStyle}
              />
              <input
                type="date"
                value={durationEnd}
                onChange={e => setDurationEnd(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: '#DC2626', marginTop: '12px' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', padding: '16px 20px', borderTop: '1px solid #E8E8E8' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: '44px', padding: '0 24px',
              background: saving ? '#9CA3AF' : '#8C3225', color: '#FFFFFF',
              border: 'none', fontSize: '14px', fontWeight: 500,
              cursor: saving ? 'default' : 'pointer', borderRadius: '4px',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              height: '44px', padding: '0 24px',
              background: '#FFFFFF', color: '#1A1A1A',
              border: '1px solid #E8E8E8', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
