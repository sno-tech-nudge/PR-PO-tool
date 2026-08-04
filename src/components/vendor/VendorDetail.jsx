import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VendorStatusBadge from './VendorStatusBadge'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ label, value, mono }) {
  return (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex' }}>
      <div style={{ width: '200px', fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, paddingTop: '1px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1A1F36', fontFamily: mono ? 'monospace' : 'inherit', flex: 1 }}>{value || '—'}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function VendorDetail({ vendorId, user, onBack, onEdit, onApprove, onBankChange }) {
  const [vendor, setVendor]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [chequeUrl, setChequeUrl] = useState(null)
  const [panUrl, setPanUrl]   = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('vendors').select('*').eq('id', vendorId).single()
    setVendor(data)
    if (data?.cancelled_cheque_path) {
      const { data: s } = await supabase.storage.from('vendor-documents').createSignedUrl(data.cancelled_cheque_path, 3600)
      if (s?.signedUrl) setChequeUrl(s.signedUrl)
    }
    if (data?.pan_copy_path) {
      const { data: s } = await supabase.storage.from('vendor-documents').createSignedUrl(data.pan_copy_path, 3600)
      if (s?.signedUrl) setPanUrl(s.signedUrl)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [vendorId])

  if (loading) return (
    <div style={{ padding: '40px 28px', textAlign: 'center', fontSize: '13px', color: '#6B7280' }}>Loading…</div>
  )
  if (!vendor) return (
    <div style={{ padding: '40px 28px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Vendor not found.</div>
  )

  const canEdit = user.role !== 'finance' && vendor.submitted_by === user.email && vendor.status !== 'approved'
  const canApprove = user.role === 'finance' && vendor.status === 'pending'
  const canRequestBankChange = vendor.status === 'approved' && (user.role === 'finance' || vendor.submitted_by === user.email)

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 28px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <span onClick={onBack} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>Vendors</span>
          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
          <span style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace' }}>{vendor.vendor_id}</span>
        </div>

        {/* Header card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E3E8EF', background: '#F8F9FA', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginBottom: '4px' }}>{vendor.vendor_id}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#1A1F36' }}>{vendor.org_name}</div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{vendor.org_type}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <VendorStatusBadge status={vendor.status} size="lg" />
              <div style={{ display: 'flex', gap: '8px' }}>
                {canEdit && (
                  <button
                    onClick={() => onEdit(vendor)}
                    style={{ height: '30px', padding: '0 14px', background: '#FFFFFF', color: '#374151', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Edit & Resubmit
                  </button>
                )}
                {canApprove && (
                  <button
                    onClick={() => onApprove(vendor)}
                    style={{ height: '30px', padding: '0 14px', background: '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '3px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Review Vendor
                  </button>
                )}
                {canRequestBankChange && (
                  <button
                    onClick={() => onBankChange(vendor)}
                    style={{ height: '30px', padding: '0 14px', background: '#FFFFFF', color: '#374151', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Request Bank Detail Change
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0' }}>
            {[
              { label: 'Submitted By', value: vendor.submitted_by },
              { label: 'Submitted', value: fmtDate(vendor.submitted_at) },
              vendor.approved_at ? { label: 'Approved By', value: vendor.approved_by } : null,
              vendor.approved_at ? { label: 'Approved On', value: fmtDate(vendor.approved_at) } : null,
            ].filter(Boolean).map((f, i) => (
              <div key={i} style={{ padding: '12px 20px', borderRight: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6' }}>
                <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{f.label}</div>
                <div style={{ fontWeight: 600, color: '#1A1F36', fontFamily: 'monospace', fontSize: '11px' }}>{f.value || '—'}</div>
              </div>
            ))}
          </div>

          {vendor.rejection_reason && (
            <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: '#FEF2F2', borderRadius: '2px', borderLeft: '3px solid #EF4444' }}>
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rejection Reason</div>
              <div style={{ fontSize: '12px', color: '#B91C1C' }}>{vendor.rejection_reason}</div>
            </div>
          )}
        </div>

        <Section title="Organisation Details">
          <Row label="PAN Number" value={vendor.pan_number} mono />
          <Row label="Registration No." value={vendor.org_registration_number} mono />
          <Row label="Registration State" value={vendor.org_registration_state} />
          <Row label="Date of Incorporation" value={fmtDate(vendor.date_of_incorporation)} />
          <Row label="MSME Registered" value={vendor.is_msme ? 'Yes' : 'No'} />
          <Row label="GSTIN Registered" value={vendor.is_gstin_registered ? 'Yes' : 'No'} />
          {vendor.gstin && <Row label="GSTIN" value={vendor.gstin} mono />}
        </Section>

        <Section title="Contact & Address">
          <Row label="Contact Person" value={vendor.contact_person} />
          <Row label="Phone" value={vendor.phone} />
          <Row label="Email" value={vendor.email} />
          {vendor.website && <Row label="Website" value={vendor.website} />}
          <Row label="Address" value={[vendor.address_line1, vendor.address_line2].filter(Boolean).join(', ')} />
          <Row label="City / State / Pin" value={`${vendor.city}, ${vendor.state} — ${vendor.pincode}`} />
          <Row label="Country" value={vendor.country} />
        </Section>

        <Section title="Bank Account">
          <Row label="Beneficiary Name" value={vendor.beneficiary_name} />
          <Row label="Account Number" value={vendor.account_number} mono />
          <Row label="IFSC Code" value={vendor.ifsc_code} mono />
          <Row label="Bank" value={vendor.bank_name} />
          <Row label="Branch" value={vendor.branch} />
        </Section>

        <Section title="Documents">
          <div style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {chequeUrl ? (
              <a href={chequeUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline' }}>
                View Cancelled Cheque / Bank Statement
              </a>
            ) : (
              <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Cheque not available</span>
            )}
            {panUrl ? (
              <a href={panUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '13px', color: '#8C3225', textDecoration: 'underline' }}>
                View PAN Copy
              </a>
            ) : (
              <span style={{ fontSize: '13px', color: '#9CA3AF' }}>PAN copy not available</span>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
