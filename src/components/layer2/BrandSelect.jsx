import { useState } from 'react'
import QuestionScreen from './QuestionScreen'

const BRANDS = ['The/Nudge', 'the^delta', 'the*spark']

export default function BrandSelect({ onContinue, onBack }) {
  const [selected, setSelected] = useState(null)

  function handleSelect(brand) {
    setSelected(brand)
    setTimeout(() => onContinue(brand), 300)
  }

  return (
    <QuestionScreen step={7} onBack={onBack} heading="Which organisation was this for">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {BRANDS.map((brand) => (
          <div
            key={brand}
            onClick={() => handleSelect(brand)}
            style={{
              border: selected === brand ? '1px solid #1A1A1A' : '1px solid #E8E8E8',
              background: selected === brand ? '#F7F7F7' : '#FFFFFF',
              padding: '16px', height: '64px', cursor: 'pointer', borderRadius: '4px',
              display: 'flex', alignItems: 'center',
              fontSize: '14px', fontWeight: 500, color: '#1A1A1A',
            }}
          >
            {brand}
          </div>
        ))}
      </div>
    </QuestionScreen>
  )
}
