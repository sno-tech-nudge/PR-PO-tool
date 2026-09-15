import { useState } from 'react'
import QuestionScreen from './QuestionScreen'

const OPTIONS = [
  { id: 'internal', label: 'Internal team meeting or work', placeholder: 'What was discussed or decided' },
  { id: 'field', label: 'Field programme or beneficiary visit', placeholder: 'Which programme or location' },
  { id: 'donor', label: 'Donor or client engagement', placeholder: 'Who attended and what was covered' },
  { id: 'office', label: 'Office or admin', placeholder: 'What was this for' },
]

export default function PurposeType({ onContinue, onBack }) {
  const [selected, setSelected] = useState(null)
  const [description, setDescription] = useState('')

  return (
    <QuestionScreen step={4} onBack={onBack} heading="What was this for">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {OPTIONS.map((opt) => (
          <div key={opt.id}>
            <div
              onClick={() => { setSelected(opt.id); setDescription('') }}
              style={{
                border: selected === opt.id ? '1px solid var(--text)' : '1px solid var(--taupe-200)',
                background: selected === opt.id ? 'var(--taupe-50)' : 'var(--surface-card)',
                padding: '16px', height: '64px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center',
                fontSize: '14px', fontWeight: 500, color: 'var(--text)',
              }}
            >
              {opt.label}
            </div>
            {selected === opt.id && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Brief description
                </div>
                <input
                  autoFocus
                  type="text"
                  placeholder={opt.placeholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
                    fontSize: '13px', padding: '0 12px', borderRadius: 'var(--radius-sm)', outline: 'none',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => onContinue({ purpose_type: selected, description: description || null })}
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
