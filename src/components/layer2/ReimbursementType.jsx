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
              border: selected === opt.id ? '1px solid #1A1A1A' : '1px solid #E8E8E8',
              background: selected === opt.id ? '#F7F7F7' : '#FFFFFF',
              padding: '16px', height: '72px', cursor: 'pointer', borderRadius: '4px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>{opt.label}</div>
            <div style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '4px' }}>{opt.sub}</div>
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => onContinue(selected)}
          style={{
            width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
          }}
        >
          Review and save
        </button>
      )}
    </QuestionScreen>
  )
}
