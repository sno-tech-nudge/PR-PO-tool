import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { approvePO, rejectPO } from '../../lib/prApprovalActions'
import { canAccessFinance } from '../../lib/auth'
import { getDisplayName } from '../../lib/directory'
import { downloadPOBundle } from '../../lib/poBundle'
import POTemplate from '../pr/POTemplate'
import SubmitPOExpense from './SubmitPOExpense'
import PRAttachmentsModal from '../pr/PRAttachmentsModal'
import PRRequestDetailsCard from '../pr/PRRequestDetailsCard'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtAmt(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', fontSize: '13px' }}>
      <span style={{ color: '#9CA3AF', width: '140px', flexShrink: 0, fontSize: '12px', paddingTop: '1px' }}>{label}</span>
      <span style={{ color: '#1A1F36', fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '—'}</span>
    </div>
  )
}

const STATUS = {
  pending_approval: { label: 'Pending Approval', color: '#B45309', bg: '#FFFBEB' },
  issued:           { label: 'Issued',           color: '#8C3225', bg: '#fdf0ed' },
  completed:        { label: 'Completed',        color: '#15803D', bg: '#F0FDF4' },
  cancelled:        { label: 'Cancelled',        color: '#B91C1C', bg: '#FEF2F2' },
  rejected:         { label: 'Rejected',         color: '#B91C1C', bg: '#FEF2F2' },
}

export default function PODetail({ poId, user, onBack, onViewAuditTrail }) {
  const [po, setPO]         = useState(null)
  const [pr, setPR]         = useState(null)
  const [vendor, setVendor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [markingDone, setMarkingDone] = useState(false)
  const [approvingPO, setApprovingPO] = useState(false)
  const [rejectingPO, setRejectingPO] = useState(false)
  const [poRejectReason, setPoRejectReason] = useState('')
  const [poError, setPoError] = useState(null)
  const [poTemplateData, setPoTemplateData] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [linkedExpenses, setLinkedExpenses] = useState([])
  const [showSubmitExpense, setShowSubmitExpense] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [bundling, setBundling] = useState(false)
  const [bundleError, setBundleError] = useState(null)

  useEffect(() => { load() }, [poId])

  async function load() {
    setLoading(true)
    const { data: poData } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', poId)
      .single()

    if (!poData) { setLoading(false); return }
    setPO(poData)

    const [{ data: prData }, { data: vendorData }, { data: expenseData }] = await Promise.all([
      supabase.from('purchase_requests').select('*').eq('id', poData.pr_id).single(),
      supabase.from('vendors').select('*').eq('id', poData.vendor_id).single(),
      supabase.from('expense_reports').select('id, report_reference, total_amount, status').eq('po_id', poData.id),
    ])
    setPR(prData)
    setVendor(vendorData)
    setLinkedExpenses(expenseData || [])

    if (poData.pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from('po-pdfs')
        .createSignedUrl(poData.pdf_storage_path, 3600)
      if (signed?.signedUrl) setPdfUrl(signed.signedUrl)
    } else {
      setPdfUrl(null)
    }

    setLoading(false)
  }

  async function handleApprovePO() {
    setApprovingPO(true); setPoError(null)
    const result = await approvePO({ po, pr, user, setPOData: setPoTemplateData })
    if (result === true) {
      await load()
    } else {
      setPoError(result?.error ? `Could not approve this purchase order: ${result.error}` : 'Could not approve this purchase order. Please try again.')
    }
    setApprovingPO(false)
  }

  async function handleRejectPO() {
    if (!poRejectReason.trim()) { setPoError('Please enter a rejection reason.'); return }
    setApprovingPO(true); setPoError(null)
    await rejectPO({ poId, reason: poRejectReason.trim(), po, user })
    setPO(prev => ({ ...prev, status: 'rejected', rejection_reason: poRejectReason.trim() }))
    setRejectingPO(false)
    setPoRejectReason('')
    setApprovingPO(false)
  }

  async function handleMarkCompleted() {
    setMarkingDone(true)
    await supabase.from('purchase_orders').update({ status: 'completed' }).eq('id', poId)
    setPO(prev => ({ ...prev, status: 'completed' }))
    setMarkingDone(false)
  }

  async function handleDownloadBundle() {
    setBundling(true); setBundleError(null)
    try {
      const result = await downloadPOBundle({ po, pr })
      if (result.missingPdf) setBundleError('PO PDF not available yet — the download includes attachments and the approval flow only.')
    } catch (err) {
      setBundleError(err.message || 'Failed to prepare the download. Please try again.')
    }
    setBundling(false)
  }

  async function handleMarkCancelled() {
    if (!window.confirm('Cancel this purchase order?')) return
    setMarkingDone(true)
    await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', poId)
    setPO(prev => ({ ...prev, status: 'cancelled' }))
    setMarkingDone(false)
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Loading…</div>
  if (!po) return <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Purchase order not found.</div>

  const st = STATUS[po.status] || STATUS.issued
  const isFinance = canAccessFinance(user.role)
  // PO issuance is the last step of the fixed FL -> PR Approver -> PO
  // Approver chain — enforced the same way for everyone, admin included, so
  // no one can approve/reject their own request's PO by holding a broader
  // role. Other Finance-area actions on this page (marking a PO completed,
  // etc.) stay gated to the broader isFinance/admin access.
  const isPOApprover = user.role === 'finance'
  const totalSubmitted = linkedExpenses.filter(e => e.status !== 'rejected').reduce((sum, e) => sum + (Number(e.total_amount) || 0), 0)
  const pendingAmount = Math.max(0, (Number(po.amount) || 0) - totalSubmitted)

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 24px 60px' }}>
      {/* Hidden PO template for PDF generation on approval */}
      {poTemplateData && <POTemplate po={poTemplateData} pr={pr} vendor={vendor} />}

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
        <span onClick={onBack} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>
          Purchase Orders
        </span>
        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
        <span style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace' }}>{po.po_number}</span>
      </div>

      {/* Header card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginBottom: '4px' }}>{po.po_number}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: '#1A1F36' }}>{fmtAmt(po.amount)}</div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>{vendor?.org_name}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: '5px',
              fontSize: '12px', fontWeight: 600, color: st.color, background: st.bg,
            }}>
              {st.label}
            </span>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                  background: '#FFFFFF', color: '#8C3225',
                  border: '1px solid #8C3225', borderRadius: '5px',
                  textDecoration: 'none', display: 'inline-block',
                }}
              >
                ↓ Download PO PDF
              </a>
            )}
            {isFinance && (
              <button
                onClick={handleDownloadBundle}
                disabled={bundling}
                title="Finance/admin only — downloads the PO PDF, all quotation/comparative attachments, and the approval flow as one ZIP"
                style={{
                  padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                  background: bundling ? '#9CA3AF' : '#8C3225', color: '#FFFFFF',
                  border: 'none', borderRadius: '5px', cursor: bundling ? 'default' : 'pointer',
                }}
              >
                {bundling ? 'Preparing…' : '↓ Download PO + Attachments + Approval Flow'}
              </button>
            )}
            {user.role === 'admin' && onViewAuditTrail && (
              <button
                onClick={() => onViewAuditTrail(po.id)}
                title="Admin only — full Vendor → PR → PO → Expense Report audit trail"
                style={{
                  padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                  background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '5px', cursor: 'pointer',
                }}
              >
                Audit Trail
              </button>
            )}
            {bundleError && (
              <div style={{ fontSize: '11px', color: '#B91C1C', textAlign: 'right', maxWidth: '220px' }}>{bundleError}</div>
            )}
          </div>
        </div>

        <div style={{ height: '1px', background: '#F3F4F6', marginBottom: '16px' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
          <div>
            <Row label="PO Number"  value={po.po_number} mono />
            <Row label="Entity"     value={po.entity} />
            <Row label={po.status === 'pending_approval' ? 'Created On' : 'Issued On'} value={fmtDate(po.generated_at)} />
          </div>
          <div>
            <Row label="Linked PR"  value={pr?.pr_number} mono />
            <Row label="Requested By" value={getDisplayName(pr?.requested_by)} />
            <Row label="Category"   value={pr?.category} />
          </div>
        </div>
      </div>

      {/* Full PR form, exactly as submitted — everything the approver needs
          to see (budget/expense nature, categories, full amount breakdown,
          payment terms, donor allocation, single-source justification if
          any) without having to go find the PR's own detail page. */}
      {pr && <PRRequestDetailsCard pr={pr} />}

      {/* Vendor card */}
      {vendor && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
            Vendor Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            <div>
              <Row label="Organisation"  value={vendor.org_name} />
              <Row label="Type"          value={vendor.org_type} />
              <Row label="PAN"           value={vendor.pan_number} mono />
              {vendor.gstin && <Row label="GSTIN" value={vendor.gstin} mono />}
            </div>
            <div>
              <Row label="Contact"       value={vendor.contact_person} />
              <Row label="Phone"         value={vendor.phone} />
              <Row label="Email"         value={vendor.email} />
            </div>
          </div>
        </div>
      )}

      {/* Bank details */}
      {vendor?.account_number && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
            Payment Details
          </div>
          <Row label="Beneficiary"   value={vendor.beneficiary_name} />
          <Row label="Account No."   value={vendor.account_number} mono />
          <Row label="IFSC"          value={vendor.ifsc_code} mono />
          <Row label="Bank"          value={`${vendor.bank_name}${vendor.branch ? ' — ' + vendor.branch : ''}`} />
        </div>
      )}

      {/* Quotations & Attachments — shown before the approve/reject panel so
          Finance has already seen the underlying quotes, not just a link
          that used to not exist on this page at all. */}
      {pr && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quotations & Attachments
            </div>
            <button
              onClick={() => setShowAttachments(true)}
              style={{ height: '30px', padding: '0 14px', background: '#FFFFFF', color: '#8C3225', border: '1px solid #E3E8EF', borderRadius: '5px', fontSize: '12px', cursor: 'pointer' }}
            >
              View Attachments
            </button>
          </div>
        </div>
      )}

      {showAttachments && pr && (
        <PRAttachmentsModal pr={pr} onClose={() => setShowAttachments(false)} />
      )}

      {/* PO approval — vendor legitimacy, quotation selection rationale, documentation
          compliance for audit purposes are checked here before a PO is issued */}
      {po.status === 'rejected' && po.rejection_reason && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '3px solid #EF4444', borderRadius: '2px', padding: '10px 14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Rejection Reason</div>
          <div style={{ fontSize: '12px', color: '#B91C1C' }}>{po.rejection_reason}</div>
        </div>
      )}

      {isPOApprover && po.status === 'pending_approval' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>
            Purchase Order Approval
          </div>

          {poError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#B91C1C' }}>
              {poError}
            </div>
          )}

          {!rejectingPO ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleApprovePO}
                disabled={approvingPO}
                style={{ height: '40px', padding: '0 24px', background: approvingPO ? '#9CA3AF' : '#15803D', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: approvingPO ? 'default' : 'pointer' }}
              >
                {approvingPO ? 'Approving…' : 'Approve PO'}
              </button>
              <button
                onClick={() => setRejectingPO(true)}
                disabled={approvingPO}
                style={{ height: '40px', padding: '0 20px', background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                Reject PO
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Rejection reason</div>
              <textarea
                value={poRejectReason}
                onChange={e => setPoRejectReason(e.target.value)}
                rows={3}
                placeholder="Why is this purchase order being rejected? (e.g. vendor legitimacy concerns, missing documentation)"
                style={{ width: '100%', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px 12px', fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleRejectPO}
                  disabled={approvingPO}
                  style={{ height: '38px', padding: '0 24px', background: approvingPO ? '#9CA3AF' : '#B91C1C', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: approvingPO ? 'default' : 'pointer' }}
                >
                  {approvingPO ? 'Saving…' : 'Confirm Rejection'}
                </button>
                <button
                  onClick={() => { setRejectingPO(false); setPoRejectReason('') }}
                  style={{ height: '38px', padding: '0 18px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expense submissions against this PO — tranche payments */}
      {po.status === 'issued' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Expense Submissions
            </div>
            {pendingAmount > 0 && (
              <button
                onClick={() => setShowSubmitExpense(true)}
                style={{ height: '32px', padding: '0 14px', fontSize: '12px', fontWeight: 600, background: '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
              >
                Submit Expense for this PO
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 20px', marginBottom: linkedExpenses.length ? '16px' : '0' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '2px' }}>Approved</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1A1F36' }}>{fmtAmt(po.amount)}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '2px' }}>Total Submitted</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1A1F36' }}>{fmtAmt(totalSubmitted)}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '2px' }}>Pending</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: pendingAmount > 0 ? '#B45309' : '#15803D' }}>{fmtAmt(pendingAmount)}</div>
            </div>
          </div>

          {linkedExpenses.length > 0 && (
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
              {linkedExpenses.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0' }}>
                  <span style={{ fontFamily: 'monospace', color: '#6B7280' }}>{e.report_reference}</span>
                  <span style={{ color: '#374151' }}>{fmtAmt(e.total_amount)}</span>
                  <span style={{ color: e.status === 'rejected' ? '#B91C1C' : '#6B7280', textTransform: 'capitalize' }}>{e.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showSubmitExpense && (
        <SubmitPOExpense
          po={po}
          pr={pr}
          vendor={vendor}
          user={user}
          pending={pendingAmount}
          onClose={() => setShowSubmitExpense(false)}
          onSubmitted={async () => { setShowSubmitExpense(false); await load() }}
        />
      )}

      {/* Finance actions */}
      {isFinance && po.status === 'issued' && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button
            onClick={handleMarkCompleted}
            disabled={markingDone}
            style={{
              height: '38px', padding: '0 20px', fontSize: '13px', fontWeight: 600,
              background: '#16A34A', color: '#FFFFFF', border: 'none',
              borderRadius: '6px', cursor: 'pointer', opacity: markingDone ? 0.6 : 1,
            }}
          >
            Mark as Completed
          </button>
          <button
            onClick={handleMarkCancelled}
            disabled={markingDone}
            style={{
              height: '38px', padding: '0 20px', fontSize: '13px', fontWeight: 500,
              background: '#FFFFFF', color: '#DC2626',
              border: '1px solid #FECACA', borderRadius: '6px', cursor: 'pointer',
              opacity: markingDone ? 0.6 : 1,
            }}
          >
            Cancel PO
          </button>
        </div>
      )}
    </div>
  )
}
