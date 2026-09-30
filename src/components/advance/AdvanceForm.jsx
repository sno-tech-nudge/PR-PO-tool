import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { ENTITIES, getPrograms, getSubprograms } from '../../lib/donorData'
import { getApproverEmailsForLevel } from '../../lib/auth'
import { sendAdvanceEmail } from '../../lib/advanceEmail'
import { blockNonNumericKey, sanitizeNumericValue, sanitizeNumericPaste } from '../../lib/numericInput'
import { MAX_ADVANCE_AMOUNT, isAutoRejected, autoRejectReason } from '../../lib/advanceValidation'
import VoiceInputButton from '../shared/VoiceInputButton'

const ADVANCE_TYPES = ['Travel', 'Event', 'Other']

const inputStyle = {
  width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
  borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: '14px',
  color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
  background: 'var(--surface-card)', fontFamily: 'inherit',
}
const labelStyle = { fontSize: '13px', color: 'var(--text)', fontWeight: 500, marginBottom: '8px', display: 'block' }
const required = <span style={{ color: 'var(--clay-text)' }}> *</span>

export default function AdvanceForm({ user, onSaved, onBack }) {
  const [amount, setAmount] = useState('')
  const [expectedUsageDate, setExpectedUsageDate] = useState('')
  const [description, setDescription] = useState('')
  const [entity, setEntity] = useState('')
  const [program, setProgram] = useState('')
  const [stream, setStream] = useState('')
  const [advanceType, setAdvanceType] = useState('')
  const [isMulti, setIsMulti] = useState(false)
  const [numPeople, setNumPeople] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const programs = useMemo(() => getPrograms(entity), [entity])
  const streams = useMemo(() => getSubprograms(entity, program), [entity, program])

  function handleEntityChange(v) { setEntity(v); setProgram(''); setStream('') }
  function handleProgramChange(v) { setProgram(v); setStream('') }

  function getErrors() {
    if (!amount || Number(amount) <= 0) return 'Please enter the advance amount.'
    if (Number(amount) > MAX_ADVANCE_AMOUNT) return `Advance amount cannot exceed ₹${MAX_ADVANCE_AMOUNT.toLocaleString('en-IN')}.`
    if (!expectedUsageDate) return 'Please select the expected advance usage date.'
    if (!description.trim()) return 'Please enter a description for this advance.'
    if (!entity) return 'Please select an entity.'
    if (!program) return 'Please select a program.'
    if (!advanceType) return 'Please select the type of advance.'
    if (isMulti && (!numPeople || Number(numPeople) <= 0)) return 'Please enter the number of people this advance is being raised for.'
    return null
  }

  async function handleSubmit() {
    const err = getErrors()
    if (err) { setError(err); return }
    setSaving(true)
    setError(null)

    const autoRejected = isAutoRejected(expectedUsageDate)
    const payload = {
      requested_by: user.email,
      amount: Number(amount),
      description: description.trim(),
      expected_usage_date: expectedUsageDate,
      entity,
      program,
      stream: stream || null,
      advance_type: advanceType,
      is_multi_individual: isMulti,
      num_people: isMulti ? Number(numPeople) : null,
      status: autoRejected ? 'auto_rejected' : 'pending_approval',
      rejection_reason: autoRejected ? autoRejectReason(expectedUsageDate) : null,
    }

    const { data, error: insertErr } = await supabase.from('advances').insert(payload).select().single()
    if (insertErr) {
      setError(`Could not submit advance: ${insertErr.message}`)
      setSaving(false)
      return
    }

    if (autoRejected) {
      sendAdvanceEmail({ type: 'auto_rejected', recipientEmail: user.email, amount: data.amount, description: data.description, reason: data.rejection_reason })
    } else {
      sendAdvanceEmail({ type: 'submitted', recipientEmail: user.email, amount: data.amount, description: data.description })
      getApproverEmailsForLevel(null).then(emails => {
        sendAdvanceEmail({ type: 'submitted', recipientEmail: emails, amount: data.amount, description: data.description, actorName: user.name })
      })
    }

    onSaved(data)
    setSaving(false)
  }

  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <span onClick={onBack} style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer' }}>Advances</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Request Advance</span>
        </div>

        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 20px' }}>Request Advance</h1>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '20px' }}>
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Amount (INR){required}</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(sanitizeNumericValue(e.target.value))}
              onKeyDown={blockNonNumericKey}
              onPaste={sanitizeNumericPaste}
              placeholder={`Maximum ₹${MAX_ADVANCE_AMOUNT.toLocaleString('en-IN')}`}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Expected Advance Usage Date{required}</label>
            <input
              type="date"
              value={expectedUsageDate}
              onChange={e => setExpectedUsageDate(e.target.value)}
              style={inputStyle}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Must be raised at least 7 days before this date, or it will be automatically rejected.
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Advance Description{required}</label>
            <div style={{ position: 'relative' }}>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                style={{ ...inputStyle, height: 'auto', padding: '10px 12px', paddingRight: '40px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <VoiceInputButton value={description} onChange={setDescription} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
            <div>
              <label style={labelStyle}>Entity{required}</label>
              <select value={entity} onChange={e => handleEntityChange(e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Program{required}</label>
              <select value={program} onChange={e => handleProgramChange(e.target.value)} disabled={!entity} style={inputStyle}>
                <option value="">Select…</option>
                {programs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
            <div>
              <label style={labelStyle}>Stream</label>
              <select value={stream} onChange={e => setStream(e.target.value)} disabled={!program} style={inputStyle}>
                <option value="">Select…</option>
                {streams.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type of Advance{required}</label>
              <select value={advanceType} onChange={e => setAdvanceType(e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                {ADVANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: isMulti ? '14px' : '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isMulti} onChange={e => setIsMulti(e.target.checked)} style={{ width: '15px', height: '15px' }} />
              Please check if you are raising for more than 1 individual
            </label>
          </div>

          {isMulti && (
            <div style={{ marginBottom: '4px' }}>
              <label style={labelStyle}>No of people for whom you are raising the request{required}</label>
              <input
                type="text"
                inputMode="numeric"
                value={numPeople}
                onChange={e => setNumPeople(sanitizeNumericValue(e.target.value).replace('.', ''))}
                onKeyDown={blockNonNumericKey}
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--clay-text)', marginTop: '14px' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                height: '44px', padding: '0 24px',
                background: saving ? 'var(--text-muted)' : 'var(--action)', color: 'var(--surface-card)',
                border: 'none', fontSize: '14px', fontWeight: 600, cursor: saving ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)',
              }}
            >
              {saving ? 'Submitting…' : 'Request Advance'}
            </button>
            <button
              onClick={onBack}
              disabled={saving}
              style={{
                height: '44px', padding: '0 24px', background: 'var(--surface-card)', color: 'var(--text)',
                border: '1px solid var(--taupe-200)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
