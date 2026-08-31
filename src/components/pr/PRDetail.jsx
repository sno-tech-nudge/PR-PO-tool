import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { createPendingPO, approvePRLevel, rejectPRLevel } from '../../lib/prApprovalActions'
import { canAccessApprovals, canAccessFinance } from '../../lib/auth'
import { getDisplayName } from '../../lib/directory'
import AmountInput from '../shared/AmountInput'
import PRStatusTimeline from './PRStatusTimeline'
import PRAttachmentsModal from './PRAttachmentsModal'

const PO_STATUS_LABEL = {
  pending_approval: 'Pending Approval',
  issued: 'Issued',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '13px' }}>
      <span style={{ color: '#9CA3AF', width: '130px', flexShrink: 0, fontSize: '12px', paddingTop: '1px' }}>{label}</span>
      <span style={{ color: '#1A1F36' }}>{value || '—'}</span>
    </div>
  )
}

const LINK_CONF = {
  high:   { label: 'High confidence',   color: '#15803D', bg: '#F0FDF4' },
  medium: { label: 'Medium confidence', color: '#B45309', bg: '#FFFBEB' },
  manual: { label: 'Manually linked',   color: '#8C3225', bg: '#fdf0ed' },
}

export default function PRDetail({ prId, user, onBack, onEdit, showToast, onViewVendor, onViewPO, backLabel = 'My Requests' }) {
  const [pr, setPR]             = useState(null)
  const [approvals, setApprovals] = useState([])
  const [pos, setPOs]           = useState([])
  const [linkedReport, setLinkedReport] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showAttachments, setShowAttachments] = useState(false)
  const [creatingPO, setCreatingPO] = useState(false)
  const [newPOAmount, setNewPOAmount] = useState('')
  const [poError, setPoError]   = useState(null)

  // Approve / reject — merged in from the former PRApproverView.jsx so a
  // PR's own detail page is the one place everyone (requester, manager,
  // finance) sees the same approval trail and, when applicable, can act.
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState(null)

  // Advisory-only "someone else is already reviewing this" indicator —
  // while this viewer can act on the PR (same rule as canAction below,
  // recomputed here since hooks can't run after the early-return checks),
  // heartbeat a presence row and poll for any other eligible approver
  // doing the same, so two people holding the same role don't both approve
  // at once without knowing. Never blocks the actual approve/reject action.
  const [reviewingBy, setReviewingBy] = useState(null)

  useEffect(() => { load() }, [prId])

  useEffect(() => {
    if (!pr) return
    const pending = approvals.find(a => a.status === 'pending')
    const matches = pending?.required_role ? user.role === pending.required_role : canAccessApprovals(user.role)
    // Not eligible to act right now — skip presence entirely. No need to
    // reset reviewingBy here since the badge only ever renders inside the
    // canAction block below, so a stale value here is simply never shown.
    if (!(pr.status === 'submitted' && pending && matches)) return

    let cancelled = false
    async function heartbeat() {
      await supabase.from('pr_review_presence').upsert(
        { pr_id: prId, viewer_email: user.email, viewer_name: user.name, updated_at: new Date().toISOString() },
        { onConflict: 'pr_id,viewer_email' }
      )
    }
    async function pollOthers() {
      const cutoff = new Date(Date.now() - 60000).toISOString()
      const { data } = await supabase
        .from('pr_review_presence')
        .select('viewer_email, viewer_name, updated_at')
        .eq('pr_id', prId)
        .neq('viewer_email', user.email)
        .gt('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (!cancelled) setReviewingBy(data?.[0] || null)
    }
    heartbeat(); pollOthers()
    const interval = setInterval(() => { heartbeat(); pollOthers() }, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
      supabase.from('pr_review_presence').delete().eq('pr_id', prId).eq('viewer_email', user.email).then(() => {})
    }
  }, [pr?.id, pr?.status, approvals, user.role, user.email])

  async function load() {
    setLoading(true)
    const [{ data: prData }, { data: approvData }] = await Promise.all([
      supabase.from('purchase_requests').select('*, vendors(*)').eq('id', prId).single(),
      supabase.from('pr_approvals').select('*').eq('pr_id', prId).order('approver_level'),
    ])
    setPR(prData)
    setApprovals(approvData || [])
    if (prData?.linked_expense_report_id) {
      const { data: rep } = await supabase.from('expense_reports').select('id, report_reference, total_amount, status, brand').eq('id', prData.linked_expense_report_id).single()
      setLinkedReport(rep)
    }
    if (prData) {
      const { data: poData } = await supabase.from('purchase_orders').select('*').eq('pr_id', prId).order('generated_at', { ascending: true })
      setPOs(poData || [])
    }
    setLoading(false)
  }

  const allocated = pos
    .filter(p => p.status !== 'cancelled' && p.status !== 'rejected')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const remaining = Math.max(0, Number(pr?.amount || 0) - allocated)
  const canCreatePO = canAccessFinance(user.role) && ['approved', 'po_generated'].includes(pr?.status) && remaining > 0

  async function handleCreateAdditionalPO() {
    const amt = Number(newPOAmount)
    if (!amt || amt <= 0) { setPoError('Enter a valid amount.'); return }
    if (amt > remaining) { setPoError(`Amount can't exceed the remaining ₹${remaining.toLocaleString('en-IN')}.`); return }
    setPoError(null)
    await createPendingPO({ prId, pr, amount: amt })
    setNewPOAmount('')
    setCreatingPO(false)
    await load()
  }

  async function handleApprove() {
    setSaving(true); setError(null)
    const currentPending = approvals.find(a => a.status === 'pending')
    if (!currentPending) { setError('No pending approval level found.'); setSaving(false); return }

    const result = await approvePRLevel({ prId, approvals, user, pr })
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

  const canEdit = user.email === pr.requested_by && pr.status === 'rejected'
  const lc = pr.link_confidence ? LINK_CONF[pr.link_confidence] : null
  const currentPending = approvals.find(a => a.status === 'pending')
  // Each level is only actionable by its assigned role (FL, then PR
  // Approver) — the same rule applies to every account, admin included, so
  // no one can approve/reject out of turn or approve their own request just
  // by holding the admin role. required_role is null on PRs submitted before
  // this gate existed, so those legacy rows fall back to the old
  // any-approver-role rule.
  const roleMatches = currentPending?.required_role
    ? user.role === currentPending.required_role
    : canAccessApprovals(user.role)
  const canAction = pr.status === 'submitted' && !!currentPending && roleMatches
  const isFullyApproved = pr.status === 'approved' || pr.status === 'po_generated'

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
        <span onClick={onBack} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>{backLabel}</span>
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
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            {user.email !== pr.requested_by && (
              <div style={{ fontSize: '11px', color: '#6B7280', textAlign: 'right' }}>
                <div>Requested by</div>
                <div style={{ color: '#374151', fontWeight: 600 }}>{getDisplayName(pr.requested_by)}</div>
              </div>
            )}
            {canEdit && (
              <button
                onClick={() => onEdit(pr)}
                style={{ height: '32px', padding: '0 14px', background: '#FFFFFF', color: '#374151', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
              >
                Edit & Resubmit
              </button>
            )}
          </div>
        </div>
        <PRStatusTimeline status={pr.status} approvals={approvals} />

        {pr.status === 'rejected' && pr.rejection_reason && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '3px solid #EF4444', borderRadius: '2px', padding: '10px 14px', marginTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Rejection Reason</div>
            <div style={{ fontSize: '12px', color: '#B91C1C' }}>{pr.rejection_reason}</div>
          </div>
        )}

        {pr.status === 'submitted' && pr.rejection_reason && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #F59E0B', borderRadius: '2px', padding: '10px 14px', marginTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Previously Rejected — Resubmitted</div>
            <div style={{ fontSize: '12px', color: '#92400E' }}>{pr.rejection_reason}</div>
          </div>
        )}

        {Number(pr.advance_percent) >= 100 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid #EF4444', borderRadius: '2px', padding: '10px 14px', marginTop: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>100% Advance — FL Email Approval Required</div>
            <div style={{ fontSize: '12px', color: '#7F1D1D', lineHeight: 1.6 }}>
              This request asks for full payment in advance. Explicit Functional Leader approval over email is required before it proceeds.
              {pr.advance_fl_email_ack ? ' Requester has confirmed email approval has been / will be obtained.' : ' Requester has not confirmed email approval.'}
              {pr.advance_approval_screenshot_path ? ' Approval screenshot attached.' : ' No approval screenshot attached.'}
            </div>
          </div>
        )}

        {pr.ai_summary && (
          <div style={{ background: '#F8F9FA', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '10px 14px', marginTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>AI Summary</div>
            <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.5 }}>{pr.ai_summary}</div>
          </div>
        )}
      </div>

      {/* Request Details */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Request Details</div>
        <Row label="Budgeted" value={pr.budgeted == null ? '—' : pr.budgeted ? 'Budgeted' : 'Not Budgeted'} />
        <Row label="Expense Nature" value={pr.expense_type} />
        <Row label="Category" value={pr.category} />
        <Row label="Entity" value={pr.entity} />
        <Row label="Program" value={pr.program} />
        <Row label="Subprogram" value={pr.subprogram} />
        <Row label="Impact Stream" value={pr.impact_stream} />
        <Row label="Purpose" value={pr.purpose} />
        <Row label="Recurring" value={pr.is_recurring ? `Yes — ${pr.recurring_frequency || ''}` : 'No'} />
        <Row label="From Date" value={fmtDate(pr.from_date)} />
        <Row label="To Date" value={fmtDate(pr.to_date)} />
        <Row label="Submitted" value={fmtDate(pr.submitted_at)} />

        {/* Amount breakdown */}
        {(pr.base_amount != null || pr.tax_amount != null || pr.incidental_amount != null) && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Amount Breakdown</div>
            {pr.line_items?.length > 0 ? (
              <div style={{ marginBottom: '8px' }}>
                {pr.line_items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#1A1F36' }}>{it.description || `Item ${i + 1}`} — {it.quantity} × ₹{Number(it.rate_per_unit || 0).toLocaleString('en-IN')}</span>
                    <span style={{ color: '#1A1F36', fontWeight: 600 }}>₹{((Number(it.quantity) || 0) * (Number(it.rate_per_unit) || 0)).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {pr.quantity != null && <Row label="Quantity" value={pr.quantity} />}
                {pr.rate_per_unit != null && <Row label="Rate per Unit" value={`₹${Number(pr.rate_per_unit).toLocaleString('en-IN')}`} />}
              </>
            )}
            <Row label="Base" value={pr.base_amount != null ? `₹${Number(pr.base_amount).toLocaleString('en-IN')}` : '—'} />
            <Row label="Tax (GST)" value={pr.tax_amount != null ? `₹${Number(pr.tax_amount).toLocaleString('en-IN')}` : '—'} />
            {Number(pr.incidental_amount) > 0 && <Row label="Incidentals" value={`₹${Number(pr.incidental_amount).toLocaleString('en-IN')}`} />}
            <Row label="Total" value={`₹${Number(pr.amount || 0).toLocaleString('en-IN')}`} />
          </div>
        )}

        {/* Payment terms — advance split plus the mandatory credit term covering the after-delivery portion */}
        {pr.advance_percent != null && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Payment Terms</div>
            <Row label="Advance" value={`${Number(pr.advance_percent)}%`} />
            <Row label="After delivery" value={`${pr.after_delivery_percent != null ? Number(pr.after_delivery_percent) : 100 - Number(pr.advance_percent)}%`} />
            {pr.credit_term_frequency && <Row label="Credit Term" value={pr.credit_term_frequency} />}
            {pr.credit_term_date && <Row label="Due Date" value={fmtDate(pr.credit_term_date)} />}
            {Number(pr.advance_percent) >= 100 && (
              <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '4px' }}>
                100% advance — FL email approval required{pr.advance_fl_email_ack ? ' (acknowledged)' : ''}.
                {pr.advance_approval_screenshot_path ? ' Approval screenshot attached.' : ' No approval screenshot attached.'}
              </div>
            )}
          </div>
        )}
      </div>

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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Vendor</div>
          <div
            onClick={() => onViewVendor?.(pr.vendor_id)}
            style={onViewVendor ? { cursor: 'pointer' } : undefined}
          >
            <Row label="Organisation" value={
              onViewVendor
                ? <span style={{ color: '#8C3225', textDecoration: 'underline' }}>{pr.vendors.org_name}</span>
                : pr.vendors.org_name
            } />
          </div>
          <Row label="Type" value={pr.vendors.org_type} />
          <Row label="PAN" value={pr.vendors.pan_number} />
          {pr.vendors.gstin && <Row label="GSTIN" value={pr.vendors.gstin} />}
          <Row label="Contact" value={pr.vendors.contact_person} />
          <Row label="Bank" value={pr.vendors.bank_name || pr.vendors.beneficiary_name ? `${pr.vendors.bank_name || '—'} — ${pr.vendors.beneficiary_name || '—'}` : null} />
          <Row label="Account No." value={pr.vendors.account_number} />
          <Row label="IFSC" value={pr.vendors.ifsc_code} />
        </div>
      )}

      {/* Attachments — shown before the approval trail/action panel so
          whoever is about to approve or reject has already seen the
          underlying quotations, not just a link buried below the decision. */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '16px 20px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Quotations & Attachments
          </div>
          <button
            onClick={() => setShowAttachments(true)}
            style={{ height: '30px', padding: '0 14px', background: '#FFFFFF', color: '#8C3225', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
          >
            View Attachments
          </button>
        </div>
      </div>

      {/* Approvals */}
      {approvals.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Approval Trail</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8F9FA' }}>
                {['Level','Approver','Status','Date'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {approvals.map((a, i) => {
                const statusColor = a.status === 'approved' ? '#15803D' : a.status === 'rejected' ? '#B91C1C' : a.status === 'waiting' ? '#9CA3AF' : '#B45309'
                return (
                  <tr key={a.id} style={{ borderBottom: i < approvals.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#374151', fontWeight: 600 }}>{a.approver_name}</td>
                    <td style={{ padding: '10px 14px', fontSize: '11px', color: '#6B7280' }}>{a.approver_email ? getDisplayName(a.approver_email) : '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: statusColor }}>{a.status.charAt(0).toUpperCase() + a.status.slice(1)}</td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#9CA3AF' }}>{fmtDate(a.actioned_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Action panel — Approve / Reject, shown only when the viewer can act */}
      {canAction && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>
            Your Decision — Level {currentPending?.approver_level} ({currentPending?.approver_name})
          </div>

          {reviewingBy && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '3px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#92400E' }}>
              ⚠ This PR is already being reviewed by <strong>{reviewingBy.viewer_name || reviewingBy.viewer_email}</strong>. Check with them before acting to avoid a duplicate decision.
            </div>
          )}

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
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '14px 18px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#15803D' }}>
            {pr.status === 'po_generated' ? 'Purchase Order issued — see Purchase Orders for details.' : 'Fully approved — Purchase Order pending Finance approval.'}
          </div>
        </div>
      )}

      {/* Purchase Orders */}
      {(pos.length > 0 || canCreatePO) && (
        <div style={{ background: '#fdf0ed', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '16px 20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
            Purchase Order{pos.length !== 1 ? 's' : ''}
          </div>

          {pos.map((p, i) => (
            <div
              key={p.id}
              onClick={() => onViewPO?.(p.id)}
              style={{
                marginBottom: i < pos.length - 1 ? '10px' : 0, paddingBottom: i < pos.length - 1 ? '10px' : 0,
                borderBottom: i < pos.length - 1 ? '1px solid rgba(30,64,175,0.15)' : 'none',
                cursor: onViewPO ? 'pointer' : 'default',
              }}
            >
              <Row label="PO Number" value={
                onViewPO
                  ? <span style={{ fontWeight: 700, color: '#1E40AF', textDecoration: 'underline' }}>{p.po_number}</span>
                  : p.po_number
              } />
              <Row label="Amount" value={`₹${Number(p.amount || 0).toLocaleString('en-IN')}`} />
              <Row label="Status" value={PO_STATUS_LABEL[p.status] || p.status} />
            </div>
          ))}

          {pr.amount != null && (
            <div style={{ fontSize: '12px', color: '#1E40AF', marginTop: '10px', paddingTop: '10px', borderTop: pos.length > 0 ? '1px solid rgba(30,64,175,0.15)' : 'none' }}>
              Allocated ₹{allocated.toLocaleString('en-IN')} of ₹{Number(pr.amount).toLocaleString('en-IN')} approved · ₹{remaining.toLocaleString('en-IN')} remaining
            </div>
          )}

          {canCreatePO && (
            <div style={{ marginTop: '12px' }}>
              {!creatingPO ? (
                <button
                  onClick={() => setCreatingPO(true)}
                  style={{ height: '34px', padding: '0 16px', background: '#FFFFFF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  + Create Additional PO
                </button>
              ) : (
                <div>
                  {poError && <div style={{ fontSize: '12px', color: '#B91C1C', marginBottom: '8px' }}>{poError}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <AmountInput
                      value={newPOAmount}
                      onChange={setNewPOAmount}
                      placeholder={`Up to ${remaining.toLocaleString('en-IN')}`}
                      style={{ width: '170px' }}
                      inputStyle={{ height: '34px' }}
                    />
                    <button
                      onClick={handleCreateAdditionalPO}
                      style={{ height: '34px', padding: '0 16px', background: '#1E40AF', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Create
                    </button>
                    <button
                      onClick={() => { setCreatingPO(false); setNewPOAmount(''); setPoError(null) }}
                      style={{ height: '34px', padding: '0 14px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Linked Expense Report */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Linked Expense Report</div>
        {linkedReport ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#8C3225', fontFamily: 'monospace' }}>{linkedReport.report_reference}</span>
              {lc && (
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '2px', background: lc.bg, color: lc.color }}>{lc.label}</span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#374151' }}>
              INR {Number(linkedReport.total_amount || 0).toLocaleString('en-IN')} · {linkedReport.brand} · {linkedReport.status}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#9CA3AF' }}>No expense report linked yet. Finance can manually link one if needed.</div>
        )}
      </div>

      {showAttachments && (
        <PRAttachmentsModal pr={pr} onClose={() => setShowAttachments(false)} />
      )}
    </div>
  )
}
