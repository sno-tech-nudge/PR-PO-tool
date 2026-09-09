import { buildPRTimelineSteps } from '../../lib/prStatusSteps'

if (typeof document !== 'undefined' && !document.getElementById('pr-timeline-style')) {
  const s = document.createElement('style')
  s.id = 'pr-timeline-style'
  s.textContent = `@keyframes prPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }`
  document.head.appendChild(s)
}

export default function PRStatusTimeline({ status = 'draft', approvals, compact = false }) {
  const steps = buildPRTimelineSteps(status, approvals)

  return (
    <div style={{ padding: compact ? '8px 0' : '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {steps.map((step, i) => {
          const isDone = step.state === 'done'
          const isCurrent = step.state === 'current'
          const isRejected = step.state === 'rejected'
          const activeColor = isRejected ? '#DC2626' : isDone ? '#16A34A' : isCurrent ? '#1A1A1A' : null

          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && (
                <div style={{
                  position: 'absolute', top: '4px', right: '50%', width: '100%', height: '1px',
                  background: isDone || isRejected ? activeColor : '#E8E8E8', zIndex: 0,
                }} />
              )}
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%', zIndex: 1, position: 'relative', flexShrink: 0,
                background: activeColor || '#FFFFFF',
                border: `1.5px solid ${activeColor || '#E8E8E8'}`,
                animation: isCurrent ? 'prPulse 2s ease-in-out infinite' : 'none',
              }} />
              <div style={{
                fontSize: compact ? '9px' : '10px', textAlign: 'center', marginTop: '6px', lineHeight: '1.3',
                color: activeColor || '#6B6B6B',
                fontWeight: isCurrent || isRejected ? 500 : 400,
                paddingLeft: '2px', paddingRight: '2px',
              }}>
                {step.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
