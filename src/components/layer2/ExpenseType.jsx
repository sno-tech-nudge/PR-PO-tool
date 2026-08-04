import { useState } from 'react'
import QuestionScreen from './QuestionScreen'

const OPTIONS = [
  { id: 'just_me', label: 'Just me', sub: 'Personal expense' },
  { id: 'my_team', label: 'My team', sub: 'Paid for colleagues' },
  { id: 'client_donor', label: 'Client or donor', sub: 'External attendees' },
  { id: 'field_visit', label: 'Field visit', sub: 'Programme related travel' },
]

export default function ExpenseType({ onContinue, onBack }) {
  const [selected, setSelected] = useState(null)

  function handleSelect(id) {
    setSelected(id)
    setTimeout(() => onContinue(id), 300)
  }

  return (
    <QuestionScreen step={2} onBack={onBack} heading="Who was this expense for">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {OPTIONS.map((opt) => (
          <div
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            style={{
              border: selected === opt.id ? '1px solid #1A1A1A' : '1px solid #E8E8E8',
              background: selected === opt.id ? '#F7F7F7' : '#FFFFFF',
              padding: '16px', minHeight: '72px', cursor: 'pointer', borderRadius: '4px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>{opt.label}</div>
            <div style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '4px' }}>{opt.sub}</div>
          </div>
        ))}
      </div>
    </QuestionScreen>
  )
}
