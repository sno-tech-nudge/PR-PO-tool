export default function QuestionScreen({ step, totalSteps = 8, onBack, heading, children }) {
  const pct = Math.round((step / totalSteps) * 100)
  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '13px', color: '#4A4A4A', padding: 0, flexShrink: 0,
          }}
        >
          Back
        </button>
        <div style={{ flex: 1, height: '2px', background: '#E8E8E8' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#8C3225' }} />
        </div>
        <span style={{ fontSize: '11px', color: '#6B6B6B', flexShrink: 0 }}>
          {step} of {totalSteps}
        </span>
      </div>
      {heading && (
        <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '20px' }}>
          {heading}
        </div>
      )}
      {children}
    </div>
  )
}
