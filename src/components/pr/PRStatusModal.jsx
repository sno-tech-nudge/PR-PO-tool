import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getDisplayName } from '../../lib/directory'

// Same visual language as VendorStatusModal.jsx (horizontal tracker + a
// vertical timeline card on the brand accent background) — kept as its own
// copy rather than a shared component since a PR's stages come from a
// different shape of data (pr_approvals rows + a purchase_orders row,
// not flat columns on one record).
if (typeof document !== 'undefined' && !document.getElementById('pr-status-style')) {
  const s = document.createElement('style')
  s.id = 'pr-status-style'
  s.textContent = `@keyframes prStatusPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }`
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

// Builds the stage progression for one PR: Draft -> Submitted -> Functional
// Leader -> PR Approver -> PO / Finance, with Rejected breaking the chain
// at whichever level it happened.
function buildSteps(pr, approvals, po) {
  const isDraft = pr.status === 'draft'
  const rejectedApproval = approvals.find(a => a.status === 'rejected')
  const isRejected = pr.status === 'rejected'

  const levelStep = (level, label) => {
    const a = approvals.find(x => x.approver_level === level)
    if (!a) return { key: `level-${level}`, label, state: 'waiting', date: null, actor: null }
    const state = a.status === 'approved' ? 'done'
      : a.status === 'rejected' ? 'rejected'
      : a.status === 'pending' ? 'current'
      : 'waiting'
    return {
      key: `level-${level}`, label, state,
      date: a.actioned_at, actor: state === 'waiting' ? null : (a.approver_email ? getDisplayName(a.approver_email) : a.approver_name),
      role: label, note: a.status === 'rejected' ? pr.rejection_reason : null,
    }
  }

  const poState = po
    ? po.status === 'issued' ? 'done' : po.status === 'rejected' ? 'rejected' : 'current'
    : (pr.status === 'approved' || pr.status === 'po_generated') ? 'current' : 'waiting'

  return [
    {
      key: 'draft', label: 'Draft',
      state: isDraft ? 'current' : 'done',
      date: pr.created_at, actor: getDisplayName(pr.requested_by), role: 'Requester',
    },
    {
      key: 'submitted', label: 'Submitted',
      state: isDraft ? 'waiting' : 'done',
      date: pr.submitted_at, actor: getDisplayName(pr.requested_by), role: 'Requester',
    },
    isDraft
      ? { key: 'level-1', label: 'Functional Leader', state: 'waiting', date: null, actor: null }
      : levelStep(1, 'Functional Leader'),
    isDraft || (rejectedApproval && rejectedApproval.approver_level === 1)
      ? { key: 'level-2', label: 'PR Approver', state: 'waiting', date: null, actor: null }
      : levelStep(2, 'PR Approver'),
    {
      key: 'po', label: po?.status === 'issued' ? 'PO Issued' : po?.status === 'rejected' ? 'PO Rejected' : 'PO / Finance',
      state: isRejected && !po ? 'waiting' : poState,
      date: po?.approved_at || po?.generated_at || null,
      actor: po?.status === 'issued' ? (po.approved_by ? getDisplayName(po.approved_by) : 'Finance') : po ? 'Finance' : null,
      role: 'Finance', note: po?.status === 'rejected' ? po.rejection_reason : null,
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
        const activeColor = isRejected ? '#DC2626' : isDone ? '#15803D' : isCurrent ? '#B45309' : null

        return (
          <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div style={{
                position: 'absolute', top: '10px', right: '50%', width: '100%', height: '2px',
                background: isDone || isRejected ? activeColor : '#E5E7EB', zIndex: 0,
              }} />
            )}
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', zIndex: 1, position: 'relative', flexShrink: 0,
              background: activeColor || '#FFFFFF',
              border: `2px solid ${activeColor || '#D1D5DB'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: isCurrent ? 'prStatusPulse 2s ease-in-out infinite' : 'none',
            }}>
              {(isDone || isRejected) && (
                <span style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 700, lineHeight: 1 }}>
                  {isRejected ? '✕' : '✓'}
                </span>
              )}
            </div>
            <div style={{
              fontSize: '10px', fontWeight: 700, textAlign: 'center', marginTop: '8px', lineHeight: '1.3',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              color: isCurrent ? '#9CA3AF' : activeColor || '#9CA3AF',
              paddingLeft: '4px', paddingRight: '4px',
            }}>
              {step.label}
            </div>
            {step.date && (
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '3px' }}>{fmtShort(step.date)}</div>
            )}
            {step.actor && (
              <div style={{ fontSize: '10px', color: isCurrent ? '#B45309' : '#6B7280', marginTop: '1px', textAlign: 'center' }}>{step.actor}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function VerticalTimeline({ pr, steps }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: '16px', width: '400px', maxWidth: '100%',
      boxShadow: '0 12px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '2px' }}>Purchase Request</div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1F36', fontFamily: 'monospace' }}>{pr.pr_number || 'Draft'}</div>
      </div>
      <div style={{ padding: '20px 22px 22px' }}>
        {steps.map((step, i) => {
          const isDone = step.state === 'done'
          const isCurrent = step.state === 'current'
          const isRejected = step.state === 'rejected'
          const isWaiting = step.state === 'waiting'
          const dotColor = isRejected ? '#DC2626' : (isDone || isCurrent) ? '#15803D' : '#D1D5DB'
          const big = isCurrent || isRejected || (isDone && i === steps.length - 1)

          return (
            <div key={step.key} style={{ display: 'flex', gap: '14px' }}>
              <div style={{ width: '58px', flexShrink: 0, textAlign: 'right', paddingTop: '1px' }}>
                {step.date ? (
                  <>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', lineHeight: '1.4' }}>{fmtDateLine(step.date)}</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>{fmtTimeLine(step.date)}</div>
                  </>
                ) : <div style={{ fontSize: '10px', color: '#D1D5DB' }}>—</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: big ? '14px' : '10px', height: big ? '14px' : '10px', borderRadius: '50%', flexShrink: 0,
                  background: isWaiting ? '#FFFFFF' : dotColor,
                  border: `2px solid ${isWaiting ? '#E5E7EB' : dotColor}`,
                  marginTop: big ? '0' : '2px',
                  animation: isCurrent ? 'prStatusPulse 2s ease-in-out infinite' : 'none',
                }} />
                {i < steps.length - 1 && (
                  <div style={{ width: '2px', flex: 1, minHeight: '30px', background: isWaiting ? '#F3F4F6' : '#E5E7EB', marginTop: '2px' }} />
                )}
              </div>
              <div style={{ paddingBottom: '18px', flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: isWaiting ? '#D1D5DB' : '#1A1F36' }}>
                  {step.label.toUpperCase()}
                </div>
                {!isWaiting && step.actor && (
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
                    {step.actor}{step.role ? <span style={{ fontStyle: 'italic' }}> — ({step.role})</span> : null}
                  </div>
                )}
                {isCurrent && (
                  <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px', fontWeight: 600 }}>Awaiting decision</div>
                )}
                {step.note && (
                  <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '4px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '6px 8px' }}>
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

export default function PRStatusModal({ pr, onClose }) {
  const [approvals, setApprovals] = useState([])
  const [po, setPO] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pr) return
    let cancelled = false
    async function load() {
      const [{ data: approvData }, { data: poData }] = await Promise.all([
        supabase.from('pr_approvals').select('*').eq('pr_id', pr.id).order('approver_level'),
        supabase.from('purchase_orders').select('*').eq('pr_id', pr.id).order('generated_at', { ascending: true }).limit(1).maybeSingle(),
      ])
      if (!cancelled) {
        setApprovals(approvData || [])
        setPO(poData || null)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [pr?.id])

  if (!pr) return null
  const steps = loading ? [] : buildSteps(pr, approvals, po)

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '620px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '10px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
      >
        <div style={{ background: '#FFFFFF', borderRadius: '10px 10px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 0' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>{pr.vendors?.org_name || pr.pr_number || 'Purchase Request'}</div>
            <span onClick={onClose} style={{ cursor: 'pointer', fontSize: '18px', color: '#9CA3AF', lineHeight: 1 }}>×</span>
          </div>
          {loading ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Loading…</div>
          ) : (
            <HorizontalTracker steps={steps} />
          )}
        </div>

        {!loading && (
          <div style={{ background: '#8C3225', padding: '36px 24px', display: 'flex', justifyContent: 'center', borderRadius: '0 0 10px 10px' }}>
            <VerticalTimeline pr={pr} steps={steps} />
          </div>
        )}
      </div>
    </div>
  )
}
