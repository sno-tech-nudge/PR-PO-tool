// Shared dot/circle progress indicator for any multi-step form or wizard —
// originally built for PRForm.jsx, now reused wherever a form has more than
// one step so people always have a sense of how much is left.
export default function StepIndicator({ current, total, labels }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600,
              background: i < current ? '#16A34A' : i === current ? '#8C3225' : '#E5E7EB',
              color: i <= current ? '#FFFFFF' : '#6B7280',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: '10px', fontWeight: i === current ? 700 : 500, color: i === current ? '#1A1F36' : '#9CA3AF', whiteSpace: 'nowrap' }}>
              {labels?.[i]}
            </div>
          </div>
          {i < total - 1 && <div style={{ width: '36px', height: '1px', background: i < current ? '#16A34A' : '#E5E7EB', marginTop: '13px' }} />}
        </div>
      ))}
    </div>
  )
}
