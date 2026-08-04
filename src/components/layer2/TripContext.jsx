import { useState } from 'react'
import QuestionScreen from './QuestionScreen'

export default function TripContext({ onContinue, onBack }) {
  const [selected, setSelected] = useState(null)
  const [tripName, setTripName] = useState('')

  const cards = [
    { id: 'yes', label: 'Yes', sub: 'This expense happened during a trip or field visit' },
    { id: 'no', label: 'No', sub: 'This was a standalone expense' },
  ]

  return (
    <QuestionScreen step={5} onBack={onBack} heading="Was this part of a trip or visit">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {cards.map((card) => (
          <div key={card.id}>
            <div
              onClick={() => setSelected(card.id)}
              style={{
                border: selected === card.id ? '1px solid #1A1A1A' : '1px solid #E8E8E8',
                background: selected === card.id ? '#F7F7F7' : '#FFFFFF',
                padding: '16px', height: '72px', cursor: 'pointer', borderRadius: '4px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>{card.label}</div>
              <div style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '4px' }}>{card.sub}</div>
            </div>
            {selected === 'yes' && card.id === 'yes' && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '6px' }}>Trip or visit name</div>
                <input
                  autoFocus
                  type="text"
                  placeholder="Rajasthan field visit, May 2026"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  style={{
                    width: '100%', height: '44px', border: '1px solid #E8E8E8',
                    fontSize: '13px', padding: '0 12px', borderRadius: '4px', outline: 'none',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => onContinue({ trip_related: selected === 'yes', trip_name: selected === 'yes' ? (tripName || null) : null })}
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
