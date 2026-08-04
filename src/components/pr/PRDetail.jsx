import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { createPendingPO } from '../../lib/prApprovalActions'
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

export default function PRDetail({ prId, user, onBack, onEdit }) {
  const [pr, setPR]             = useState(null)
  const [approvals, setApprovals] = useState([])
  const [pos, setPOs]           = useState([])
  const [linkedReport, setLinkedReport] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showAttachments, setShowAttachments] = useState(false)
  const [creatingPO, setCreatingPO] = useState(false)
  const [newPOAmount, setNewPOAmount] = useState('')
  const [poError, setPoError]   = useState(null)

  useEffect(() => { load() }, [prId])

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
  const canCreatePO = user.role === 'finance' && ['approved', 'po_generated'].includes(pr?.status) && remaining > 0

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

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#6B7280' }}>Loading…</div>
  if (!pr) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Request not found.</div>

  const canEdit = user.email === pr.requested_by && pr.status === 'rejected'
  const lc = pr.link_confidence ? LINK_CONF[pr.link_confidence] : null

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
        <span onClick={onBack} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>My Requests</span>
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
          {canEdit && (
            <button
              onClick={() => onEdit(pr)}
              style={{ height: '32px', padding: '0 14px', background: '#FFFFFF', color: '#374151', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
            >
              Edit & Resubmit
            </button>
          )}
        </div>
        <PRStatusTimeline status={pr.status} approvals={approvals} />

        {pr.rejection_reason && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '3px solid #EF4444', borderRadius: '2px', padding: '10px 14px', marginTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Rejection Reason</div>
            <div style={{ fontSize: '12px', color: '#B91C1C' }}>{pr.rejection_reason}</div>
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
        <Row label="Submitted" value={fmtDate(pr.submitted_at)} />

        {/* Amount breakdown */}
        {(pr.base_amount != null || pr.tax_amount != null || pr.incidental_amount != null) && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Amount Breakdown</div>
            <Row label="Base" value={pr.base_amount != null ? `₹${Number(pr.base_amount).toLocaleString('en-IN')}` : '—'} />
            <Row label="Tax (GST)" value={pr.tax_amount != null ? `₹${Number(pr.tax_amount).toLocaleString('en-IN')}` : '—'} />
            {Number(pr.incidental_amount) > 0 && <Row label="Incidentals" value={`₹${Number(pr.incidental_amount).toLocaleString('en-IN')}`} />}
            <Row label="Total" value={`₹${Number(pr.amount || 0).toLocaleString('en-IN')}`} />
          </div>
        )}

        {/* Advance split */}
        {pr.advance_percent != null && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Payment Terms</div>
            <Row label="Advance" value={`${Number(pr.advance_percent)}%`} />
            <Row label="After delivery" value={`${pr.after_delivery_percent != null ? Number(pr.after_delivery_percent) : 100 - Number(pr.advance_percent)}%`} />
            {Number(pr.advance_percent) >= 100 && (
              <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '4px' }}>
                100% advance — FL email approval required{pr.advance_fl_email_ack ? ' (acknowledged)' : ''}.
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
          <Row label="Organisation" value={pr.vendors.org_name} />
          <Row label="Type" value={pr.vendors.org_type} />
          <Row label="PAN" value={pr.vendors.pan_number} />
          <Row label="Contact" value={pr.vendors.contact_person} />
          <Row label="Bank" value={`${pr.vendors.bank_name} — ${pr.vendors.beneficiary_name}`} />
        </div>
      )}

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
                    <td style={{ padding: '10px 14px', fontSize: '11px', color: '#6B7280', fontFamily: 'monospace' }}>{a.approver_email || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: statusColor }}>{a.status.charAt(0).toUpperCase() + a.status.slice(1)}</td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#9CA3AF' }}>{fmtDate(a.actioned_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Purchase Orders */}
      {(pos.length > 0 || canCreatePO) && (
        <div style={{ background: '#fdf0ed', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '16px 20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
            Purchase Order{pos.length !== 1 ? 's' : ''}
          </div>

          {pos.map((p, i) => (
            <div key={p.id} style={{ marginBottom: i < pos.length - 1 ? '10px' : 0, paddingBottom: i < pos.length - 1 ? '10px' : 0, borderBottom: i < pos.length - 1 ? '1px solid rgba(30,64,175,0.15)' : 'none' }}>
              <Row label="PO Number" value={p.po_number} />
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
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={newPOAmount}
                      onChange={e => setNewPOAmount(e.target.value)}
                      placeholder={`Up to ₹${remaining.toLocaleString('en-IN')}`}
                      style={{ height: '34px', width: '160px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 10px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
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

      {/* Attachments */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Attachments
          </div>
          <button
            onClick={() => setShowAttachments(true)}
            style={{ height: '30px', padding: '0 14px', background: '#FFFFFF', color: '#8C3225', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
          >
            View Attachments
          </button>
        </div>
      </div>

      {showAttachments && (
        <PRAttachmentsModal pr={pr} onClose={() => setShowAttachments(false)} />
      )}
    </div>
  )
}
