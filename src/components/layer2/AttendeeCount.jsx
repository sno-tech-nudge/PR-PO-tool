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
              width: '52px', height: '52px', border: selected === c ? '1px solid var(--text)' : '1px solid var(--taupe-200)',
              background: selected === c ? 'var(--text)' : 'var(--surface-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 'var(--radius-sm)', flexShrink: 0,
              fontSize: '18px', fontWeight: 500,
              color: selected === c ? 'var(--surface-card)' : 'var(--text)',
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
            width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
            fontSize: '14px', padding: '0 12px', borderRadius: 'var(--radius-sm)',
            outline: 'none', marginBottom: '12px',
          }}
        />
      )}

      {perPerson && (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Per person: ₹{perPerson.toLocaleString('en-IN')}
        </div>
      )}

      {selected && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Names of attendees (optional)
          </div>
          <input
            type="text"
            placeholder="Priya, Rahul, Sneha"
            value={names}
            onChange={(e) => setNames(e.target.value)}
            style={{
              width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
              fontSize: '13px', padding: '0 12px', borderRadius: 'var(--radius-sm)', outline: 'none',
            }}
          />
        </div>
      )}

      {selected && (
        <button
          onClick={() => onContinue({ attendee_count: effectiveCount, per_person_amount: perPerson, attendee_names: names || null })}
          style={{
            width: '100%', height: '48px', background: 'var(--action)', color: 'var(--surface-card)',
            border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          }}
        >
          Continue
        </button>
      )}
    </QuestionScreen>
  )
}
