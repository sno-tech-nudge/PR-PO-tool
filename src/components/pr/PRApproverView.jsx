import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { approvePRLevel, createPendingPO, rejectPRLevel } from '../../lib/prApprovalActions'
import PRStatusTimeline from './PRStatusTimeline'
import PRAttachmentsModal from './PRAttachmentsModal'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '13px' }}>
      <span style={{ color: '#9CA3AF', width: '140px', flexShrink: 0, fontSize: '12px', paddingTop: '1px' }}>{label}</span>
      <span style={{ color: '#1A1F36' }}>{value || '—'}</span>
    </div>
  )
}

export default function PRApproverView({ prId, user, onBack, showToast }) {
  const [pr, setPR]             = useState(null)
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading]   = useState(true)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)
  const [showAttachments, setShowAttachments] = useState(false)

  useEffect(() => { load() }, [prId])

  async function load() {
    setLoading(true)
    const [{ data: prData }, { data: approvData }] = await Promise.all([
      supabase.from('purchase_requests').select('*, vendors(*)').eq('id', prId).single(),
      supabase.from('pr_approvals').select('*').eq('pr_id', prId).order('approver_level'),
    ])
    setPR(prData)
    setApprovals(approvData || [])
    setLoading(false)
  }

  async function handleApprove() {
    setSaving(true); setError(null)
    const currentPending = approvals.find(a => a.status === 'pending')
    if (!currentPending) { setError('No pending approval level found.'); setSaving(false); return }

    const result = await approvePRLevel({ prId, approvals, user })
    if (result.isFinal) {
      await createPendingPO({ prId, pr, amount: pr.amount })
      showToast?.('Purchase request fully approved. Purchase Order created, pending Finance approval.', 'approved')
    } else {
      showToast?.(`Level ${currentPending.approver_level} approved. Forwarded to ${result.nextWaiting.approver_name}.`, 'info')
    }

    await load()
    setSaving(false)
  }

  async function handleReject() {
    if (!reason.trim()) { setError('Please enter a rejection reason.'); return }
    setSaving(true); setError(null)
    await rejectPRLevel({ prId, approvals, pr, user, reason: reason.trim() })
    showToast?.('Purchase request rejected.', 'rejected')
    await load()
    setRejecting(false)
    setReason('')
    setSaving(false)
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#6B7280' }}>Loading…</div>
  if (!pr) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Request not found.</div>

  const currentPending = approvals.find(a => a.status === 'pending')
  const canAction = pr.status === 'submitted' && !!currentPending
  const isFullyApproved = pr.status === 'approved' || pr.status === 'po_generated'

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px 60px', width: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
        <span onClick={onBack} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>PR Approvals</span>
        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
        <span style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace' }}>{pr.pr_number}</span>
      </div>

      {/* Header */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginBottom: '4px' }}>{pr.pr_number}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#1A1F36' }}>INR {Number(pr.amount || 0).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>{pr.vendors?.org_name}</div>
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280', textAlign: 'right' }}>
            <div>Requested by</div>
            <div style={{ fontFamily: 'monospace', color: '#374151' }}>{pr.requested_by}</div>
          </div>
        </div>
        <PRStatusTimeline status={pr.status} approvals={approvals} />
      </div>

      {/* AI Summary */}
      {pr.ai_summary && (
        <div style={{ background: '#fdf0ed', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '14px 18px', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>AI Summary for Approver</div>
          <div style={{ fontSize: '13px', color: '#1E3A8A', lineHeight: 1.6 }}>{pr.ai_summary}</div>
        </div>
      )}

      {/* Request details */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Request Details</div>
        <Row label="Budgeted"          value={pr.budgeted == null ? '—' : pr.budgeted ? 'Budgeted' : 'Not Budgeted'} />
        <Row label="Expense Nature"    value={pr.expense_type} />
        <Row label="Category"          value={pr.category} />
        <Row label="Entity"            value={pr.entity} />
        <Row label="Donor / Programme" value={pr.donor_name} />
        <Row label="Program"           value={pr.program} />
        <Row label="Purpose"           value={pr.purpose} />

        {/* Amount breakdown */}
        <Row label="Base Amount"  value={pr.base_amount != null ? `₹${Number(pr.base_amount).toLocaleString('en-IN')}` : '—'} />
        <Row label="Tax (GST)"    value={pr.tax_amount != null ? `₹${Number(pr.tax_amount).toLocaleString('en-IN')}` : (pr.gst_amount != null ? `₹${Number(pr.gst_amount).toLocaleString('en-IN')}` : '—')} />
        {Number(pr.incidental_amount) > 0 && <Row label="Incidentals" value={`₹${Number(pr.incidental_amount).toLocaleString('en-IN')}`} />}
        {pr.advance_percent != null && (
          <Row label="Payment Terms" value={`${Number(pr.advance_percent)}% advance · ${pr.after_delivery_percent != null ? Number(pr.after_delivery_percent) : 100 - Number(pr.advance_percent)}% after delivery`} />
        )}
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={() => setShowAttachments(true)}
            style={{ height: '30px', padding: '0 14px', background: '#FFFFFF', color: '#8C3225', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
          >
            View Attachments
          </button>
        </div>
        <Row label="Recurring" value={pr.is_recurring ? `Yes — ${pr.recurring_frequency || ''}` : 'No'} />
        <Row label="Submitted" value={fmtDate(pr.submitted_at)} />
      </div>

      {/* 100% advance — FL email approval required */}
      {Number(pr.advance_percent) >= 100 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid #EF4444', borderRadius: '6px', padding: '14px 18px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>100% Advance — FL Email Approval Required</div>
          <div style={{ fontSize: '13px', color: '#7F1D1D', lineHeight: 1.6 }}>
            This request asks for full payment in advance. Explicit Functional Leader approval over email is required before it proceeds.
            {pr.advance_fl_email_ack ? ' Requester has confirmed email approval has been / will be obtained.' : ' Requester has not confirmed email approval.'}
          </div>
        </div>
      )}

      {/* Donor / Programme Allocation */}
      {pr.donor_allocations?.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Donor / Programme Allocation</div>
          {pr.donor_allocations.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
              <span>{[a.entity, a.program, a.subprogram, a.donor].filter(Boolean).join(' / ') || '—'}</span>
              <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: '12px' }}>{a.percent}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Vendor */}
      {pr.vendors && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Vendor (Approved)</div>
          <Row label="Organisation" value={pr.vendors.org_name} />
          <Row label="Type" value={pr.vendors.org_type} />
          <Row label="PAN" value={pr.vendors.pan_number} />
          {pr.vendors.gstin && <Row label="GSTIN" value={pr.vendors.gstin} />}
          <Row label="Bank" value={`${pr.vendors.bank_name} — ${pr.vendors.beneficiary_name}`} />
          <Row label="Account No." value={pr.vendors.account_number} />
          <Row label="IFSC" value={pr.vendors.ifsc_code} />
        </div>
      )}

      {/* Approvals */}
      {approvals.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Approval Chain</span>
          </div>
          {approvals.map((a, i) => {
            const isActive  = a.status === 'pending'
            const isDone    = a.status === 'approved'
            const isRejected = a.status === 'rejected'
            const col = isDone ? '#15803D' : isRejected ? '#B91C1C' : isActive ? '#B45309' : '#9CA3AF'
            return (
              <div key={a.id} style={{ padding: '12px 20px', borderBottom: i < approvals.length - 1 ? '1px solid #F3F4F6' : 'none', background: isActive ? '#FFFBEB' : '#FFFFFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F36' }}>Level {a.approver_level} — {a.approver_name}</div>
                    {a.approver_email && <div style={{ fontSize: '11px', color: '#6B7280', fontFamily: 'monospace', marginTop: '2px' }}>{a.approver_email}</div>}
                    {a.rejection_reason && <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px' }}>{a.rejection_reason}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: col }}>
                      {a.status === 'waiting' ? 'Waiting' : a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </div>
                    {a.actioned_at && <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>{fmtDate(a.actioned_at)}</div>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Action panel */}
      {canAction && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>
            Your Decision — Level {currentPending?.approver_level} ({currentPending?.approver_name})
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#B91C1C' }}>
              {error}
            </div>
          )}

          {!rejecting ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleApprove}
                disabled={saving}
                style={{ height: '40px', padding: '0 28px', background: saving ? '#9CA3AF' : '#15803D', color: '#FFFFFF', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
              >
                {saving ? 'Saving…' : 'Approve'}
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={saving}
                style={{ height: '40px', padding: '0 24px', background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '3px', fontSize: '13px', cursor: 'pointer' }}
              >
                Reject
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Rejection reason</div>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="Explain why this purchase request is being rejected…"
                style={{ width: '100%', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '10px 12px', fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleReject}
                  disabled={saving}
                  style={{ height: '38px', padding: '0 24px', background: saving ? '#9CA3AF' : '#B91C1C', color: '#FFFFFF', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
                >
                  {saving ? 'Saving…' : 'Confirm Rejection'}
                </button>
                <button
                  onClick={() => { setRejecting(false); setReason('') }}
                  style={{ height: '38px', padding: '0 18px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '3px', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isFullyApproved && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '14px 18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#15803D' }}>
            {pr.status === 'po_generated' ? 'Purchase Order issued — see Purchase Orders for details.' : 'Fully approved — Purchase Order pending Finance approval.'}
          </div>
        </div>
      )}

      {showAttachments && (
        <PRAttachmentsModal pr={pr} onClose={() => setShowAttachments(false)} />
      )}
    </div>
  )
}
