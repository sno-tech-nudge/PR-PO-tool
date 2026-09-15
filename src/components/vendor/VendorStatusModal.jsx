import { getDisplayName } from '../../lib/directory'

if (typeof document !== 'undefined' && !document.getElementById('vendor-status-style')) {
  const s = document.createElement('style')
  s.id = 'vendor-status-style'
  s.textContent = `@keyframes vendorStatusPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }`
  document.head.appendChild(s)
}

function fmtShort(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fmtDateLine(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
}

function fmtTimeLine(d) {
  if (!d) return null
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// Builds the 4-stage progression every vendor moves through. "Accepted by
// Finance" and "Submitted" share submitted_at — the moment a vendor leaves
// draft is the same moment it lands in Finance's review queue, there's no
// separate manual "accept" action in this app today.
function buildSteps(vendor) {
  const isDraft    = vendor.status === 'draft'
  const isPending  = vendor.status === 'pending'
  const isApproved = vendor.status === 'approved'
  const isRejected = vendor.status === 'rejected'

  const finalLabel = isRejected ? 'Rejected' : 'Approved'
  const finalDate  = isRejected ? vendor.rejected_at : vendor.approved_at
  const finalActor = isRejected ? (vendor.rejected_by ? getDisplayName(vendor.rejected_by) : 'Finance') : (vendor.approved_by ? getDisplayName(vendor.approved_by) : 'Finance')

  return [
    {
      key: 'draft', label: 'Draft',
      state: isDraft ? 'current' : 'done',
      date: vendor.created_at, actor: getDisplayName(vendor.submitted_by), role: 'Submitter',
    },
    {
      key: 'submitted', label: 'Submitted',
      state: isDraft ? 'waiting' : 'done',
      date: vendor.submitted_at, actor: getDisplayName(vendor.submitted_by), role: 'Submitter',
    },
    {
      key: 'accepted', label: 'Accepted by Finance',
      state: isDraft ? 'waiting' : 'done',
      date: vendor.submitted_at, actor: 'Finance Team', role: 'Finance',
    },
    {
      key: 'final', label: isPending || isDraft ? 'Approved / Rejected' : finalLabel,
      state: isDraft ? 'waiting' : isPending ? 'current' : isRejected ? 'rejected' : 'done',
      date: finalDate, actor: (isApproved || isRejected) ? finalActor : null,
      role: 'Finance Approver',
      note: isRejected ? vendor.rejection_reason : null,
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
              animation: isCurrent ? 'vendorStatusPulse 2s ease-in-out infinite' : 'none',
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

function VerticalTimeline({ vendor, steps }) {
  return (
    <div style={{
      background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', width: '400px', maxWidth: '100%',
      boxShadow: '0 12px 32px rgba(54, 32, 26,0.18)', overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--taupe-100)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Vendor</div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{vendor.vendor_id || vendor.org_name}</div>
      </div>
      <div style={{ padding: '20px 22px 22px' }}>
        {steps.map((step, i) => {
          const isDone = step.state === 'done'
          const isCurrent = step.state === 'current'
          const isRejected = step.state === 'rejected'
          const isWaiting = step.state === 'waiting'
          const dotColor = isRejected ? 'var(--clay-text)' : (isDone || isCurrent) ? 'var(--moss-text)' : 'var(--taupe-400)'
          const big = isCurrent || isRejected || (isDone && i === steps.length - 1)

          return (
            <div key={step.key} style={{ display: 'flex', gap: '14px' }}>
              <div style={{ width: '58px', flexShrink: 0, textAlign: 'right', paddingTop: '1px' }}>
                {step.date ? (
                  <>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{fmtDateLine(step.date)}</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink)' }}>{fmtTimeLine(step.date)}</div>
                  </>
                ) : <div style={{ fontSize: '10px', color: 'var(--taupe-400)' }}>—</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: big ? '14px' : '10px', height: big ? '14px' : '10px', borderRadius: '50%', flexShrink: 0,
                  background: isWaiting ? 'var(--surface-card)' : dotColor,
                  border: `2px solid ${isWaiting ? 'var(--taupe-200)' : dotColor}`,
                  marginTop: big ? '0' : '2px',
                  animation: isCurrent ? 'vendorStatusPulse 2s ease-in-out infinite' : 'none',
                }} />
                {i < steps.length - 1 && (
                  <div style={{ width: '2px', flex: 1, minHeight: '30px', background: isWaiting ? 'var(--taupe-100)' : 'var(--taupe-200)', marginTop: '2px' }} />
                )}
              </div>
              <div style={{ paddingBottom: '18px', flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: isWaiting ? 'var(--taupe-400)' : 'var(--ink)' }}>
                  {step.label.toUpperCase()}
                </div>
                {!isWaiting && step.actor && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {step.actor} — <span style={{ fontStyle: 'italic' }}>({step.role})</span>
                  </div>
                )}
                {isCurrent && (
                  <div style={{ fontSize: '11px', color: 'var(--gold-text)', marginTop: '2px', fontWeight: 600 }}>Awaiting Finance decision</div>
                )}
                {step.note && (
                  <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '4px', background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}>
                    Reason: {step.note}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function VendorStatusModal({ vendor, onClose }) {
  if (!vendor) return null
  const steps = buildSteps(vendor)

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '620px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(54, 32, 26,0.35)' }}
      >
        {/* Header + horizontal tracker */}
        <div style={{ background: 'var(--surface-card)', borderRadius: '10px 10px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 0' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{vendor.org_name}</div>
            <span onClick={onClose} style={{ cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)', lineHeight: 1 }}>×</span>
          </div>
          <HorizontalTracker steps={steps} />
        </div>

        {/* Vertical timeline card on accent background — mirrors the app's own tracker/card style */}
        <div style={{ background: 'var(--action)', padding: '36px 24px', display: 'flex', justifyContent: 'center', borderRadius: '0 0 10px 10px' }}>
          <VerticalTimeline vendor={vendor} steps={steps} />
        </div>
      </div>
    </div>
  )
}
