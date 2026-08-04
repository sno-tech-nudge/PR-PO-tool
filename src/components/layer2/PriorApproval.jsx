import { useState } from 'react'
import QuestionScreen from './QuestionScreen'

export default function PriorApproval({ onContinue, onBack }) {
  const [selected, setSelected] = useState(null)
  const [reference, setReference] = useState('')

  const cards = [
    { id: 'yes', label: 'Yes, approval was taken', sub: 'I have a reference or approval record' },
    { id: 'no', label: 'No approval taken', sub: 'This will be flagged for review in the next step' },
  ]

  return (
    <QuestionScreen step={6} onBack={onBack} heading="Was prior approval taken for this expense">
      <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '16px' }}>
        Expenses above ₹5,000 require prior approval
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {cards.map((card) => (
          <div key={card.id}>
            <div
              onClick={() => setSelected(card.id)}
              style={{
                border: selected === card.id ? '1px solid #1A1A1A' : '1px solid #E8E8E8',
                background: selected === card.id ? '#F7F7F7' : '#FFFFFF',
                padding: '16px', cursor: 'pointer', borderRadius: '4px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '64px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>{card.label}</div>
              <div style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '4px' }}>{card.sub}</div>
            </div>
            {selected === 'yes' && card.id === 'yes' && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '6px' }}>
                  Approval reference or approver name
                </div>
                <input
                  autoFocus
                  type="text"
                  placeholder="Email reference, Slack message, or approver name"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  style={{
                    width: '100%', height: '44px', border: '1px solid #E8E8E8',
                    fontSize: '13px', padding: '0 12px', borderRadius: '4px', outline: 'none',
                  }}
                />
              </div>
            )}
            {selected === 'no' && card.id === 'no' && (
              <div style={{
                marginTop: '8px', padding: '12px',
                border: '1px solid #CA8A04', background: '#FEFCE8',
                borderRadius: '4px', fontSize: '13px', color: '#CA8A04',
              }}>
                This expense will go to your manager for approval before it can be reimbursed.
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => onContinue({ prior_approval_taken: selected === 'yes', prior_approval_reference: selected === 'yes' ? (reference || null) : null })}
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
