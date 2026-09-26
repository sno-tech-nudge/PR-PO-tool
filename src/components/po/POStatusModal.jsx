import { useState } from 'react'
import { getDisplayName } from '../../lib/directory'
import SubmitPOExpense from './SubmitPOExpense'

// Same visual language as PRStatusModal.jsx / VendorStatusModal.jsx
// (horizontal tracker + a vertical timeline card on the brand accent
// background) — kept as its own copy rather than a shared component, same
// reasoning as those two: a PO's stages come from a different shape of data
// (no multi-level approvals table — a PO is a single approve/reject action
// tracked directly on its own row, plus an open-ended invoicing period).
if (typeof document !== 'undefined' && !document.getElementById('po-status-style')) {
  const s = document.createElement('style')
  s.id = 'po-status-style'
  s.textContent = `@keyframes poStatusPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }`
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
function fmtAmt(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

// Builds the stage progression for one PO: Requested -> PO Approval ->
// Invoicing (the open-ended tranche-payment period, tracked against the
// pending balance) -> Completed, with Rejected/Cancelled breaking the
// chain at whichever point it happened.
function buildSteps(po, pr, pending, totalSubmitted) {
  const isRejected = po.status === 'rejected'
  const isCancelled = po.status === 'cancelled'
  const isPendingApproval = po.status === 'pending_approval'
  const isIssued = po.status === 'issued'
  const isCompleted = po.status === 'completed'

  const approvalState = isRejected ? 'rejected' : isPendingApproval ? 'current' : 'done'
  const invoicingState = isPendingApproval || isRejected || isCancelled
    ? 'waiting'
    : isCompleted || (isIssued && pending <= 0)
      ? 'done'
      : 'current'
  const finalLabel = isCancelled ? 'Cancelled' : 'Completed'
  const finalState = isCancelled ? 'rejected' : isCompleted ? 'done' : isIssued && pending <= 0 ? 'current' : 'waiting'

  return [
    {
      key: 'requested', label: 'Requested',
      state: 'done',
      date: po.generated_at, actor: pr?.requested_by ? getDisplayName(pr.requested_by) : null, role: 'Requester',
    },
    {
      key: 'approval', label: 'PO Approval',
      state: approvalState,
      date: po.approved_at, actor: po.approved_by ? getDisplayName(po.approved_by) : null, role: 'Finance',
      note: isRejected ? po.rejection_reason : null,
    },
    {
      key: 'invoicing', label: 'Invoicing',
      state: invoicingState,
      date: null, actor: null, role: 'Finance',
      tag: isIssued || isCompleted ? `${fmtAmt(totalSubmitted)} of ${fmtAmt(po.amount)} invoiced` : null,
    },
    {
      key: 'final', label: finalLabel,
      state: finalState,
      date: isCancelled ? null : po.status === 'completed' ? po.approved_at : null,
      actor: null, role: 'Finance',
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
              animation: isCurrent ? 'poStatusPulse 2s ease-in-out infinite' : 'none',
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

function VerticalTimeline({ po, steps, canRaiseInvoice, onRaiseInvoice }) {
  return (
    <div style={{
      background: 'var(--surface-card)', borderRadius: 'var(--radius-xl)', width: '400px', maxWidth: '100%',
      boxShadow: '0 12px 32px rgba(54, 32, 26,0.18)', overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--taupe-100)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Purchase Order</div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>{po.po_number}</div>
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
                  animation: isCurrent ? 'poStatusPulse 2s ease-in-out infinite' : 'none',
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
                    {step.actor}{step.role ? <span style={{ fontStyle: 'italic' }}> — ({step.role})</span> : null}
                  </div>
                )}
                {isCurrent && step.key === 'approval' && (
                  <div style={{ fontSize: '11px', color: 'var(--gold-text)', marginTop: '2px', fontWeight: 600 }}>Awaiting decision</div>
                )}
                {step.tag && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
                    {step.tag}
                  </div>
                )}
                {step.key === 'invoicing' && isCurrent && canRaiseInvoice && (
                  <button
                    onClick={onRaiseInvoice}
                    style={{
                      marginTop: '8px', height: '30px', padding: '0 14px', fontSize: '12px', fontWeight: 600,
                      background: 'var(--action)', color: 'var(--surface-card)', border: 'none',
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    }}
                  >
                    Raise Invoice
                  </button>
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

// pending/totalSubmitted are passed in already-computed (from
// attachPendingBalances, batched at the list level) so this modal never
// needs its own extra queries — same pattern PRStatusModal/VendorStatusModal
// use with data their own caller already loaded.
export default function POStatusModal({ po, pr, vendor, user, pending, totalSubmitted, onClose, onSubmitted }) {
  const [showSubmitExpense, setShowSubmitExpense] = useState(false)

  if (!po) return null
  const steps = buildSteps(po, pr, pending, totalSubmitted)
  const canRaiseInvoice = po.status === 'issued' && pending > 0

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '620px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(54, 32, 26,0.35)' }}
      >
        <div style={{ background: 'var(--surface-card)', borderRadius: '10px 10px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 0' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{vendor?.org_name || po.po_number}</div>
            <span onClick={onClose} style={{ cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)', lineHeight: 1 }}>×</span>
          </div>
          <HorizontalTracker steps={steps} />
        </div>

        <div style={{ background: 'var(--action)', padding: '36px 24px', display: 'flex', justifyContent: 'center', borderRadius: '0 0 10px 10px' }}>
          <VerticalTimeline
            po={po}
            steps={steps}
            canRaiseInvoice={canRaiseInvoice}
            onRaiseInvoice={() => setShowSubmitExpense(true)}
          />
        </div>
      </div>

      {showSubmitExpense && (
        <div onClick={e => e.stopPropagation()}>
          <SubmitPOExpense
            po={po}
            pr={pr}
            vendor={vendor}
            user={user}
            pending={pending}
            onClose={() => setShowSubmitExpense(false)}
            onSubmitted={async (detail) => {
              setShowSubmitExpense(false)
              if (onSubmitted) await onSubmitted(detail)
            }}
          />
        </div>
      )}
    </div>
  )
}
