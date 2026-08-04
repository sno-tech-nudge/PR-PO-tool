const STEPS = ['Submitted', 'Under Review', 'Approved', 'Processing', 'Reimbursed']

// Inject pulse keyframe once
if (typeof document !== 'undefined' && !document.getElementById('status-timeline-style')) {
  const s = document.createElement('style')
  s.id = 'status-timeline-style'
  s.textContent = `@keyframes statusPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }`
  document.head.appendChild(s)
}

export default function StatusTimeline({ currentStep = 0, compact = false }) {
  // currentStep: 0=Submitted, 1=Under Review, 2=Approved, 3=Processing, 4=Reimbursed
  // -1 = rejected (show up to submitted only)

  return (
    <div style={{ padding: compact ? '8px 0' : '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEPS.map((step, i) => {
          const isDone = currentStep >= 0 && i < currentStep
          const isCurrent = i === currentStep

          return (
            <div
              key={step}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              {/* Connecting line from previous step */}
              {i > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  right: '50%',
                  width: '100%',
                  height: '1px',
                  background: isDone ? '#16A34A' : '#E8E8E8',
                  zIndex: 0,
                }} />
              )}

              {/* Circle */}
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isDone ? '#16A34A' : isCurrent ? '#1A1A1A' : '#FFFFFF',
                border: `1.5px solid ${isDone ? '#16A34A' : isCurrent ? '#1A1A1A' : '#E8E8E8'}`,
                zIndex: 1,
                position: 'relative',
                flexShrink: 0,
                animation: isCurrent ? 'statusPulse 2s ease-in-out infinite' : 'none',
              }} />

              {/* Label */}
              <div style={{
                fontSize: compact ? '9px' : '10px',
                textAlign: 'center',
                marginTop: '6px',
                lineHeight: '1.3',
                color: isDone ? '#16A34A' : isCurrent ? '#1A1A1A' : '#6B6B6B',
                fontWeight: isCurrent ? 500 : 400,
                paddingLeft: '2px',
                paddingRight: '2px',
              }}>
                {step}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
