import { useState } from 'react'
import QuestionScreen from './QuestionScreen'
import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'

const COUNTS = ['2', '3', '4', '5', '6', '7+']

export default function AttendeeCount({ amount, onContinue, onBack }) {
  const [selected, setSelected] = useState(null)
  const [exactCount, setExactCount] = useState('')
  const [names, setNames] = useState('')

  const effectiveCount = selected === '7+' ? (parseInt(exactCount) || null) : (selected ? parseInt(selected) : null)
  const perPerson = effectiveCount && amount ? Math.round(amount / effectiveCount) : null

  return (
    <QuestionScreen step={3} onBack={onBack} heading="How many people including you">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {COUNTS.map((c) => (
          <div
            key={c}
            onClick={() => setSelected(c)}
            style={{
              width: '52px', height: '52px', border: selected === c ? '1px solid #1A1A1A' : '1px solid #E8E8E8',
              background: selected === c ? '#1A1A1A' : '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: '4px', flexShrink: 0,
              fontSize: '18px', fontWeight: 500,
              color: selected === c ? '#FFFFFF' : '#1A1A1A',
            }}
          >
            {c}
          </div>
        ))}
      </div>

      {selected === '7+' && (
        <input
          type="number"
          placeholder="Enter number"
          value={exactCount}
          onChange={(e) => setExactCount(sanitizeNumericValue(e.target.value))}
          onKeyDown={blockNonNumericKey}
          onPaste={sanitizeNumericPaste}
          style={{
            width: '100%', height: '44px', border: '1px solid #E8E8E8',
            fontSize: '14px', padding: '0 12px', borderRadius: '4px',
            outline: 'none', marginBottom: '12px',
          }}
        />
      )}

      {perPerson && (
        <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '16px' }}>
          Per person: ₹{perPerson.toLocaleString('en-IN')}
        </div>
      )}

      {selected && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '6px' }}>
            Names of attendees (optional)
          </div>
          <input
            type="text"
            placeholder="Priya, Rahul, Sneha"
            value={names}
            onChange={(e) => setNames(e.target.value)}
            style={{
              width: '100%', height: '44px', border: '1px solid #E8E8E8',
              fontSize: '13px', padding: '0 12px', borderRadius: '4px', outline: 'none',
            }}
          />
        </div>
      )}

      {selected && (
        <button
          onClick={() => onContinue({ attendee_count: effectiveCount, per_person_amount: perPerson, attendee_names: names || null })}
          style={{
            width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
          }}
        >
          Continue
        </button>
      )}
    </QuestionScreen>
  )
}
