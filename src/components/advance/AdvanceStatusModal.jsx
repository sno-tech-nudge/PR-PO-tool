import { getDisplayName } from '../../lib/directory'

if (typeof document !== 'undefined' && !document.getElementById('advance-status-style')) {
  const s = document.createElement('style')
  s.id = 'advance-status-style'
  s.textContent = `@keyframes advanceStatusPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }`
  document.head.appendChild(s)
}

function fmtShort(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

// Draft -> Submitted -> Approver validates -> Advance recorded, matching the
// "How It Works" flow the org gave us. auto_rejected renders as a rejection
// at the "Approver validates" step, with the system-generated reason shown
// exactly like a human rejection reason.
function buildSteps(advance) {
  const isPending    = advance.status === 'pending_approval'
  const isApproved   = advance.status === 'approved' || advance.status === 'recorded'
  const isRejected   = advance.status === 'rejected'
  const isAutoReject = advance.status === 'auto_rejected'
  const isRecorded   = advance.status === 'recorded'

  const decisionState = (isRejected || isAutoReject) ? 'rejected' : isPending ? 'current' : 'done'
  const decisionActor = isAutoReject ? 'System' : (advance.rejected_by ? getDisplayName(advance.rejected_by) : advance.approved_by ? getDisplayName(advance.approved_by) : null)
  const decisionDate = isAutoReject ? advance.created_at : advance.rejected_at || advance.approved_at

  return [
    {
      key: 'submitted', label: 'Submitted', state: 'done',
      date: advance.created_at, actor: getDisplayName(advance.requested_by), role: 'Requester',
    },
    {
      key: 'decision', label: (isRejected || isAutoReject) ? 'Rejected' : isPending ? 'Approved / Rejected' : 'Approved',
      state: decisionState,
      date: decisionActor ? decisionDate : null, actor: decisionActor, role: 'Approver',
      note: (isRejected || isAutoReject) ? advance.rejection_reason : null,
    },
    {
      key: 'recorded', label: 'Recorded (Disbursed)',
      state: (isRejected || isAutoReject) ? 'skipped' : isRecorded ? 'done' : isApproved ? 'current' : 'waiting',
      date: advance.recorded_at, actor: advance.recorded_by ? getDisplayName(advance.recorded_by) : null, role: 'Finance',
    },
  ]
}

function HorizontalTracker({ steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '20px 24px 24px' }}>
      {steps.map((step, i) => {
        const isDone = step.state === 'done'
        const isCurrent = step.state === 'current'
        const isRejected = step.state === 'rejected'
        const activeColor = isRejected ? 'var(--clay-text)' : isDone ? 'var(--moss-text)' : isCurrent ? 'var(--gold-text)' : null

        return (
          <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div style={{
                position: 'absolute', top: '10px', right: '50%', width: '100%', height: '2px',
                background: isDone || isRejected ? activeColor : 'var(--taupe-200)', zIndex: 0,
              }} />
            )}
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', zIndex: 1, position: 'relative', flexShrink: 0,
              background: activeColor || 'var(--surface-card)',
              border: `2px solid ${activeColor || 'var(--taupe-400)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: isCurrent ? 'advanceStatusPulse 2s ease-in-out infinite' : 'none',
              opacity: step.state === 'skipped' ? 0.4 : 1,
            }}>
              {(isDone || isRejected) && (
                <span style={{ color: 'var(--surface-card)', fontSize: '12px', fontWeight: 700, lineHeight: 1 }}>
                  {isRejected ? '✕' : '✓'}
                </span>
              )}
            </div>
            <div style={{
              fontSize: '10px', fontWeight: 700, textAlign: 'center', marginTop: '8px', lineHeight: '1.3',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              color: isCurrent ? 'var(--text-muted)' : activeColor || 'var(--text-muted)',
              opacity: step.state === 'skipped' ? 0.4 : 1,
              paddingLeft: '4px', paddingRight: '4px',
            }}>
              {step.label}
            </div>
            {step.date && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{fmtShort(step.date)}</div>
            )}
            {step.actor && (
              <div style={{ fontSize: '10px', color: isCurrent ? 'var(--gold-text)' : 'var(--text-muted)', marginTop: '1px', textAlign: 'center' }}>{step.actor}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AdvanceStatusModal({ advance, onClose }) {
  if (!advance) return null
  const steps = buildSteps(advance)

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(54, 32, 26,0.35)', background: 'var(--surface-card)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 0' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Advance</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>₹{Number(advance.amount).toLocaleString('en-IN')} · {advance.description}</div>
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)', lineHeight: 1 }}>×</span>
        </div>
        <HorizontalTracker steps={steps} />
        {(advance.status === 'rejected' || advance.status === 'auto_rejected') && advance.rejection_reason && (
          <div style={{ margin: '0 24px 24px', background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', fontSize: '13px', color: 'var(--clay-text)' }}>
            Reason: {advance.rejection_reason}
          </div>
        )}
      </div>
    </div>
  )
}
