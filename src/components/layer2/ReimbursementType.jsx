import { useState } from 'react'
import QuestionScreen from './QuestionScreen'

const OPTIONS = [
  { id: 'bank_transfer', label: 'Bank transfer', sub: 'Transferred to your registered bank account' },
  { id: 'petty_cash', label: 'Petty cash', sub: 'Collected from the finance team in person' },
]

export default function ReimbursementType({ onContinue, onBack }) {
  const [selected, setSelected] = useState(null)

  return (
    <QuestionScreen step={8} onBack={onBack} heading="How would you like to be reimbursed">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {OPTIONS.map((opt) => (
          <div
            key={opt.id}
            onClick={() => setSelected(opt.id)}
            style={{
              border: selected === opt.id ? '1px solid var(--text)' : '1px solid var(--taupe-200)',
              background: selected === opt.id ? 'var(--taupe-50)' : 'var(--surface-card)',
              padding: '16px', height: '72px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>{opt.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{opt.sub}</div>
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => onContinue(selected)}
          style={{
            width: '100%', height: '48px', background: 'var(--action)', color: 'var(--surface-card)',
            border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          }}
        >
          Review and save
        </button>
      )}
    </QuestionScreen>
  )
}
