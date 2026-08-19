import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import PanDuplicateModal from './PanDuplicateModal'
import { sendVendorEmail } from '../../lib/vendorEmail'

// Sole Proprietorship shares the same Aadhaar-based document requirement as
// Individual/Freelancer per Finance's Vendor Document Requirements sheet.
const AADHAAR_REQUIRED_ORG_TYPES = ['Individual/Freelancer', 'Proprietorship']

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ label, value, mono }) {
  return (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex' }}>
      <div style={{ width: '220px', fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, paddingTop: '1px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1A1F36', fontFamily: mono ? 'monospace' : 'inherit', flex: 1 }}>{value || '—'}</div>
    </div>
  )
}

export default function VendorApprovalView({ vendor, user, onBack, onActioned }) {
  const [rejecting, setRejecting]   = useState(false)
  const [reason, setReason]         = useState('')
  const [approveComment, setApproveComment] = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const [chequeUrl, setChequeUrl]   = useState(null)
  const [panUrl, setPanUrl]         = useState(null)
  const [aadhaarUrl, setAadhaarUrl] = useState(null)
  const [aadhaarProofUrl, setAadhaarProofUrl] = useState(null)
  const [panSiblings, setPanSiblings] = useState([])
  const [showPanModal, setShowPanModal] = useState(false)

  useEffect(() => {
    if (vendor?.cancelled_cheque_path) {
      supabase.storage.from('vendor-documents').createSignedUrl(vendor.cancelled_cheque_path, 3600)
        .then(({ data: s }) => { if (s?.signedUrl) setChequeUrl(s.signedUrl) })
    }
    if (vendor?.pan_copy_path) {
      supabase.storage.from('vendor-documents').createSignedUrl(vendor.pan_copy_path, 3600)
        .then(({ data: s }) => { if (s?.signedUrl) setPanUrl(s.signedUrl) })
    }
    if (vendor?.aadhaar_copy_path) {
      supabase.storage.from('vendor-documents').createSignedUrl(vendor.aadhaar_copy_path, 3600)
        .then(({ data: s }) => { if (s?.signedUrl) setAadhaarUrl(s.signedUrl) })
    }
    if (vendor?.aadhaar_pan_link_proof_path) {
      supabase.storage.from('vendor-documents').createSignedUrl(vendor.aadhaar_pan_link_proof_path, 3600)
        .then(({ data: s }) => { if (s?.signedUrl) setAadhaarProofUrl(s.signedUrl) })
    }
    if (vendor?.pan_number) {
      supabase.from('vendors').select('id, vendor_id, org_name, status, submitted_by')
        .eq('pan_number', vendor.pan_number).neq('id', vendor.id)
        .then(({ data }) => setPanSiblings(data || []))
    }
  }, [vendor])

  async function handleApprove() {
    setSaving(true); setError(null)
    const comment = approveComment.trim()
    const { error: err } = await supabase.from('vendors').update({
      status: 'approved',
      approved_by: user.email,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
      rejected_by: null,
      rejected_at: null,
      notes: comment || null,
    }).eq('id', vendor.id)
    if (err) { setError(err.message); setSaving(false); return }
    // Best-effort — the query builder only implements .then(), not .catch(),
    // so a real try/catch is needed here to avoid a TypeError masking success.
    try {
      await supabase.from('expense_notifications').insert({
        recipient_id: vendor.submitted_by,
        type: 'vendor_approved',
        message: `Your vendor "${vendor.org_name}" has been approved. You can now raise purchase requests against them.${comment ? ` Comment: ${comment}` : ''}`,
        related_type: 'vendor',
        related_id: vendor.id,
      })
    } catch { /* non-blocking — the vendor is already approved above */ }
    sendVendorEmail({
      type: 'approved', vendorOrgName: vendor.org_name, vendorId: vendor.vendor_id,
      recipientEmail: vendor.submitted_by, actorName: user.name || user.email, comment,
    })
    onActioned('approved')
  }

  async function handleReject() {
    if (!reason.trim()) { setError('Please enter a rejection reason.'); return }
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('vendors').update({
      status: 'rejected',
      rejection_reason: reason.trim(),
      rejected_by: user.email,
      rejected_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
    }).eq('id', vendor.id)
    if (err) { setError(err.message); setSaving(false); return }
    try {
      await supabase.from('expense_notifications').insert({
        recipient_id: vendor.submitted_by,
        type: 'vendor_rejected',
        message: `Your vendor "${vendor.org_name}" was not approved. Reason: ${reason.trim()}. You can edit and resubmit.`,
        related_type: 'vendor',
        related_id: vendor.id,
      })
    } catch { /* non-blocking — the vendor is already rejected above */ }
    sendVendorEmail({
      type: 'rejected', vendorOrgName: vendor.org_name, vendorId: vendor.vendor_id,
      recipientEmail: vendor.submitted_by, actorName: user.name || user.email, reason: reason.trim(),
    })
    onActioned('rejected')
  }

  if (!vendor) return null

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <span onClick={onBack} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>Vendors</span>
          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>Approve Vendor</span>
        </div>

        {/* Summary card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
            <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginBottom: '4px' }}>{vendor.vendor_id}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A1F36' }}>{vendor.org_name}</div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{vendor.org_type} · Submitted by {vendor.submitted_by}</div>
          </div>
        </div>

        {panSiblings.length > 0 && (
          <div
            onClick={() => setShowPanModal(true)}
            style={{
              background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '3px',
              padding: '12px 16px', marginBottom: '12px', fontSize: '13px', color: '#92400E', cursor: 'pointer',
            }}
          >
            ⚠ This PAN is already registered to {panSiblings.length} other vendor{panSiblings.length !== 1 ? 's' : ''} — click to view. Duplicate PAN/GST is allowed, this is informational only.
          </div>
        )}

        {/* Details */}
        {[
          {
            title: 'Organisation',
            rows: [
              ['Nature of Business', vendor.nature_of_business],
              ['PAN', vendor.pan_number, true],
              ['Registration No.', vendor.org_registration_number, true],
              ['Registration State', vendor.org_registration_state],
              ['Incorporated', fmtDate(vendor.date_of_incorporation)],
              ['MSME', vendor.is_msme ? 'Yes' : 'No'],
              ['GSTIN', vendor.is_gstin_registered ? (vendor.gstin || 'Registered but GSTIN missing') : 'Not registered', !!vendor.gstin],
              ['Related to Organisation', vendor.is_related_to_org ? `Yes — ${vendor.related_org_description || ''}` : 'No'],
            ],
          },
          {
            title: 'Contact & Address',
            rows: [
              ['Contact', vendor.contact_person],
              ['Phone', vendor.phone],
              ['Email', vendor.email],
              ['Address', [vendor.address_line1, vendor.address_line2].filter(Boolean).join(', ')],
              ['City / State', `${vendor.city}, ${vendor.state} — ${vendor.pincode}`],
            ],
          },
          {
            title: 'Bank Account',
            rows: [
              ['Beneficiary', vendor.beneficiary_name],
              ['Account No.', vendor.account_number, true],
              ['IFSC', vendor.ifsc_code, true],
              ['Bank', vendor.bank_name],
              ['Branch', vendor.branch],
            ],
          },
        ].map(section => (
          <div key={section.title} style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{section.title}</span>
            </div>
            {section.rows.map(([label, value, mono]) => (
              <Row key={label} label={label} value={value} mono={mono} />
            ))}
          </div>
        ))}

        {/* Documents */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Documents</span>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {chequeUrl ? (
              <a href={chequeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline' }}>
                View Cancelled Cheque / Bank Statement
              </a>
            ) : <span style={{ fontSize: '13px', color: '#B91C1C' }}>Cheque not uploaded</span>}
            {panUrl ? (
              <a href={panUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline' }}>
                View PAN Copy
              </a>
            ) : <span style={{ fontSize: '13px', color: '#B91C1C' }}>PAN not uploaded</span>}
          </div>
        </div>

        {AADHAAR_REQUIRED_ORG_TYPES.includes(vendor.org_type) && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Aadhaar Details (Individual Vendor)</span>
            </div>
            <Row label="Aadhaar Number" value={vendor.aadhaar_number} mono />
            <Row label="Aadhaar-PAN Linked" value={vendor.aadhaar_pan_linked ? 'Confirmed by vendor' : 'Not confirmed'} />
            <div style={{ padding: '16px 20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {aadhaarUrl ? (
                <a href={aadhaarUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline' }}>
                  View Aadhaar Copy
                </a>
              ) : <span style={{ fontSize: '13px', color: '#B91C1C' }}>Aadhaar copy not uploaded</span>}
              {vendor.aadhaar_pan_linked && (
                aadhaarProofUrl ? (
                  <a href={aadhaarProofUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline' }}>
                    View Aadhaar-PAN Link Proof
                  </a>
                ) : <span style={{ fontSize: '13px', color: '#B91C1C' }}>Link proof not uploaded</span>
              )}
            </div>
          </div>
        )}

        {/* Approve / Reject panel */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Finance Decision</span>
          </div>
          <div style={{ padding: '20px' }}>
            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#B91C1C' }}>
                {error}
              </div>
            )}

            {!rejecting ? (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Comment (optional)</div>
                <textarea
                  value={approveComment}
                  onChange={e => setApproveComment(e.target.value)}
                  placeholder="Any notes for the record or for the submitter — shown to them alongside the approval."
                  rows={2}
                  style={{
                    width: '100%', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '10px 12px',
                    fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical',
                    boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '14px',
                  }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleApprove}
                    disabled={saving}
                    style={{ height: '38px', padding: '0 24px', background: saving ? '#9CA3AF' : '#15803D', color: '#FFFFFF', border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
                  >
                    {saving ? 'Saving…' : 'Approve Vendor'}
                  </button>
                  <button
                    onClick={() => setRejecting(true)}
                    disabled={saving}
                    style={{ height: '38px', padding: '0 24px', background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '3px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Reason for rejection</div>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Be specific — the submitter will see this and use it to correct the vendor record."
                  rows={3}
                  style={{
                    width: '100%', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '10px 12px',
                    fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical',
                    boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '12px',
                  }}
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
        </div>
      </div>

      {showPanModal && (
        <PanDuplicateModal
          vendors={panSiblings}
          readOnly
          onClose={() => setShowPanModal(false)}
        />
      )}
    </div>
  )
}
