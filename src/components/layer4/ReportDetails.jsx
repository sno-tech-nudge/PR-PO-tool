import { useState } from 'react'
import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'

const ENTITIES = [
  { key: 'AIC NCORE', label: 'AIC NCORE', sub: 'Atal Incubation Centre' },
  { key: 'NLF', label: 'NLF', sub: 'Nudge Lifeskills Foundation' },
  { key: 'NLF FCRA', label: 'NLF FCRA', sub: 'Nudge Lifeskills Foundation — Foreign Contribution' },
  { key: 'TNF US', label: 'TNF US', sub: 'The Nudge Foundation US' },
  { key: 'NTPL', label: 'NTPL', sub: 'Nudge Technologies Private Limited' },
]

const PURPOSE_OPTIONS = [
  { key: 'internal', label: 'Internal team work', placeholder: 'What was the meeting or work about' },
  { key: 'field', label: 'Field programme or beneficiary visit', placeholder: 'Which programme or location' },
  { key: 'donor', label: 'Donor or client engagement', placeholder: 'Who attended and what was covered' },
  { key: 'office', label: 'Office or admin', placeholder: 'What was this for' },
]

function SectionLabel({ children, mt }) {
  return (
    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', marginTop: mt || 0, marginBottom: '12px' }}>
      {children}
    </div>
  )
}

function TapCard({ selected, onClick, main, sub, fullWidth }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: fullWidth ? undefined : 1,
        width: fullWidth ? '100%' : undefined,
        padding: '12px 14px', cursor: 'pointer', marginBottom: fullWidth ? '8px' : 0,
        border: `1.5px solid ${selected ? '#1A1A1A' : '#E8E8E8'}`,
        background: selected ? '#F7F7F7' : '#FFFFFF',
        borderRadius: '4px',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A' }}>{main}</div>
      {sub && <div style={{ fontSize: '11px', color: '#6B6B6B', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, label }) {
  return (
    <div style={{ marginTop: '8px' }}>
      {label && <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>{label}</div>}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', height: '44px', border: '1px solid #E8E8E8',
          borderRadius: '4px', padding: '0 12px', fontSize: '13px',
          color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
          background: '#FFFFFF', fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

function formatDuration(start, end) {
  if (!start && !end) return null
  const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  return `${fmt(start)} – ${fmt(end)}`
}

export default function ReportDetails({ expenses, reportMeta, onContinue, onBack }) {
  const total = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0)
  const count = (expenses || []).length

  // Section A — Who
  const [whoType, setWhoType] = useState(null) // 'just_me' | 'multiple'
  const [attendeeCount, setAttendeeCount] = useState(null) // number or '7+'
  const [customCount, setCustomCount] = useState('')
  const [attendeeNames, setAttendeeNames] = useState('')

  // Section B — Purpose (optional)
  const [purposeKey, setPurposeKey] = useState(null)
  const [purposeDescription, setPurposeDescription] = useState('')

  // Section C — Trip (optional)
  const [tripType, setTripType] = useState(null) // 'yes' | 'no'
  const [tripName, setTripName] = useState('')

  // Section D — Prior approval (optional, only if total > 5000)
  const [approvalType, setApprovalType] = useState(null) // 'yes' | 'no'
  const [approvalRef, setApprovalRef] = useState('')

  // Section E — Entity (optional per user request)
  const [entity, setEntity] = useState(null)

  // Section F — Reimbursement
  const [reimbType, setReimbType] = useState(null) // 'bank_transfer' | 'petty_cash'

  const actualCount = attendeeCount === '7+' ? (parseInt(customCount) || 7) : attendeeCount
  const perPerson = actualCount > 1 && total > 0 ? Math.round(total / actualCount) : null

  function handleContinue() {
    onContinue({
      report_id: reportMeta?.id || null,
      report_reference: reportMeta?.report_reference || null,
      business_purpose: reportMeta?.business_purpose || null,
      duration_start: reportMeta?.duration_start || null,
      duration_end: reportMeta?.duration_end || null,
      entity: entity || null,
      expense_type: whoType === 'multiple' ? 'my_team' : 'just_me',
      attendee_count: actualCount || null,
      per_person_amount: perPerson || null,
      attendee_names: attendeeNames || null,
      purpose_type: purposeKey || null,
      description: purposeDescription || null,
      trip_related: tripType === 'yes',
      trip_name: tripName || null,
      prior_approval_taken: approvalType === 'yes' ? true : approvalType === 'no' ? false : null,
      prior_approval_reference: approvalRef || null,
      reimbursement_type: reimbType || null,
    })
  }

  const inputStyle = {
    width: '100%', height: '44px', border: '1px solid #E8E8E8',
    borderRadius: '4px', padding: '0 12px', fontSize: '13px',
    color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
    background: '#FFFFFF', fontFamily: 'inherit',
  }

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
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Report Details</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '4px' }}>
        Tell us about this report
      </div>
      <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '6px' }}>
        These details apply to all {count} selected expense{count !== 1 ? 's' : ''}.
      </div>
      <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '20px' }}>Step 2 of 3 · All fields optional</div>

      {reportMeta && (
        <div style={{ border: '1px solid #E8E8E8', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #E8E8E8' }}>
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Report Name</span>
            <span style={{ fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace' }}>{reportMeta.report_reference}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #E8E8E8', background: '#F7F7F7' }}>
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Business Purpose</span>
            <span style={{ fontSize: '13px', color: '#1A1A1A', textAlign: 'right', maxWidth: '65%' }}>{reportMeta.business_purpose || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px' }}>
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>Duration</span>
            <span style={{ fontSize: '13px', color: '#1A1A1A' }}>{formatDuration(reportMeta.duration_start, reportMeta.duration_end)}</span>
          </div>
        </div>
      )}

      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '24px' }} />

      {/* SECTION A — Who */}
      <SectionLabel>Who were these expenses for</SectionLabel>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <TapCard selected={whoType === 'just_me'} onClick={() => setWhoType('just_me')} main="Just me" sub="Personal expenses" />
        <TapCard selected={whoType === 'multiple'} onClick={() => setWhoType('multiple')} main="Multiple people" sub="Team or group" />
      </div>

      {whoType === 'multiple' && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '8px' }}>
            How many people including you
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[2, 3, 4, 5, 6, '7+'].map(n => (
              <div
                key={n}
                onClick={() => setAttendeeCount(n)}
                style={{
                  width: '44px', height: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${attendeeCount === n ? '#1A1A1A' : '#E8E8E8'}`,
                  background: attendeeCount === n ? '#1A1A1A' : '#FFFFFF',
                  color: attendeeCount === n ? '#FFFFFF' : '#1A1A1A',
                  fontSize: '13px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
                }}
              >
                {n}
              </div>
            ))}
          </div>

          {attendeeCount === '7+' && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="number"
                value={customCount}
                onChange={e => setCustomCount(sanitizeNumericValue(e.target.value))}
                onKeyDown={blockNonNumericKey}
                onPaste={sanitizeNumericPaste}
                placeholder="Enter number"
                style={{ ...inputStyle, width: '140px' }}
              />
            </div>
          )}

          {perPerson && (
            <div style={{ fontSize: '12px', color: '#4A4A4A', marginTop: '8px' }}>
              ₹{Number(perPerson).toLocaleString('en-IN')} per person
            </div>
          )}

          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
              Names of attendees (optional)
            </div>
            <input
              type="text"
              value={attendeeNames}
              onChange={e => setAttendeeNames(e.target.value)}
              placeholder="Priya, Rahul, Sneha"
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* SECTION B — Purpose */}
      <SectionLabel mt={24}>What were these expenses for</SectionLabel>
      {PURPOSE_OPTIONS.map(opt => (
        <div key={opt.key}>
          <TapCard
            selected={purposeKey === opt.key}
            onClick={() => setPurposeKey(purposeKey === opt.key ? null : opt.key)}
            main={opt.label}
            fullWidth
          />
          {purposeKey === opt.key && (
            <TextInput
              value={purposeDescription}
              onChange={setPurposeDescription}
              placeholder={opt.placeholder}
              label="Brief description"
            />
          )}
        </div>
      ))}

      {/* SECTION C — Trip */}
      <SectionLabel mt={24}>Was this part of a trip or visit</SectionLabel>
      <TapCard selected={tripType === 'yes'} onClick={() => setTripType(tripType === 'yes' ? null : 'yes')} main="Yes" sub="Part of outstation travel" fullWidth />
      <TapCard selected={tripType === 'no'} onClick={() => setTripType(tripType === 'no' ? null : 'no')} main="No" sub="Local or standalone expenses" fullWidth />
      {tripType === 'yes' && (
        <TextInput
          value={tripName}
          onChange={setTripName}
          placeholder="Rajasthan field visit, May 2026"
          label="Trip or visit name"
        />
      )}

      {/* SECTION D — Prior approval (only if total > 5000) */}
      {total > 5000 && (
        <>
          <SectionLabel mt={24}>Was prior approval taken</SectionLabel>
          <TapCard selected={approvalType === 'yes'} onClick={() => setApprovalType(approvalType === 'yes' ? null : 'yes')} main="Yes" sub="I have an approval reference" fullWidth />
          <TapCard selected={approvalType === 'no'} onClick={() => setApprovalType(approvalType === 'no' ? null : 'no')} main="No" sub="Will be flagged for review" fullWidth />
          {approvalType === 'yes' && (
            <TextInput
              value={approvalRef}
              onChange={setApprovalRef}
              placeholder="Email reference, Slack message, or approver name"
              label="Approval reference"
            />
          )}
          {approvalType === 'no' && (
            <div style={{
              border: '1px solid #CA8A04', background: '#FEFCE8',
              padding: '12px', marginTop: '8px', borderRadius: '4px',
              fontSize: '12px', color: '#CA8A04', lineHeight: '1.5',
            }}>
              This report will go to your manager for approval before it can be reimbursed.
            </div>
          )}
        </>
      )}

      {/* SECTION E — Entity */}
      <SectionLabel mt={24}>Which entity were these expenses for</SectionLabel>
      <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '12px' }}>
        Select the legal entity this expense should be recorded under.
      </div>
      {ENTITIES.map(e => (
        <div key={e.key}>
          <TapCard
            selected={entity === e.key}
            onClick={() => setEntity(entity === e.key ? null : e.key)}
            main={e.label}
            sub={e.sub}
            fullWidth
          />
          {entity === 'NLF FCRA' && e.key === 'NLF FCRA' && (
            <div style={{
              border: '1px solid #8C3225', background: '#F7F7F7',
              padding: '12px', marginTop: '-4px', marginBottom: '8px',
              fontSize: '12px', color: '#4A4A4A', lineHeight: '1.5',
            }}>
              FCRA expenses are tracked separately and reported to the Ministry of Home Affairs.
            </div>
          )}
        </div>
      ))}

      {/* SECTION F — Reimbursement */}
      <SectionLabel mt={24}>How would you like to be reimbursed</SectionLabel>
      <TapCard selected={reimbType === 'bank_transfer'} onClick={() => setReimbType(reimbType === 'bank_transfer' ? null : 'bank_transfer')} main="Bank transfer" sub="Transferred to your registered account" fullWidth />
      <TapCard selected={reimbType === 'petty_cash'} onClick={() => setReimbType(reimbType === 'petty_cash' ? null : 'petty_cash')} main="Petty cash" sub="Collected from finance team in person" fullWidth />

      {/* Fixed bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: '#FFFFFF', borderTop: '1px solid #E8E8E8', padding: '16px',
        }}>
          <button
            onClick={handleContinue}
            style={{
              width: '100%', height: '48px',
              background: '#8C3225', color: '#FFFFFF',
              border: 'none', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Continue to preview
          </button>
        </div>
      </div>
    </div>
  )
}
