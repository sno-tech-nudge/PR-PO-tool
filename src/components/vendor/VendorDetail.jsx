import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getDisplayName } from '../../lib/directory'
import VendorStatusBadge from './VendorStatusBadge'
import PanDuplicateModal from './PanDuplicateModal'
import VendorPdfTemplate from './VendorPdfTemplate'
import { generateVendorProfilePDF, downloadVendorProfilePDF } from '../../lib/vendorProfilePdf'
import { canAccessFinance, canApproveVendor, isObserver } from '../../lib/auth'

// Sole Proprietorship shares the same Aadhaar-based document requirement as
// Individual/Freelancer per Finance's Vendor Document Requirements sheet.
const AADHAAR_REQUIRED_ORG_TYPES = ['Individual/Freelancer', 'Proprietorship']

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ label, value, mono }) {
  return (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--taupe-100)', display: 'flex' }}>
      <div style={{ width: '200px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, paddingTop: '1px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--ink)', fontFamily: mono ? 'monospace' : 'inherit', flex: 1 }}>{value || '—'}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function VendorDetail({ vendorId, user, onBack, onEdit, onApprove, onBankChange, backLabel = 'Vendors' }) {
  const [vendor, setVendor]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [chequeUrl, setChequeUrl] = useState(null)
  const [panUrl, setPanUrl]   = useState(null)
  const [regCertUrl, setRegCertUrl] = useState(null)
  const [msmeCertUrl, setMsmeCertUrl] = useState(null)
  const [gstCertUrl, setGstCertUrl] = useState(null)
  const [aadhaarUrl, setAadhaarUrl] = useState(null)
  const [aadhaarProofUrl, setAadhaarProofUrl] = useState(null)
  const [panSiblings, setPanSiblings] = useState([])
  const [showPanModal, setShowPanModal] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadStep, setDownloadStep] = useState(null)
  const [downloadError, setDownloadError] = useState(null)

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
    if (data?.registration_certificate_path) {
      const { data: s } = await supabase.storage.from('vendor-documents').createSignedUrl(data.registration_certificate_path, 3600)
      if (s?.signedUrl) setRegCertUrl(s.signedUrl)
    }
    if (data?.msme_certificate_path) {
      const { data: s } = await supabase.storage.from('vendor-documents').createSignedUrl(data.msme_certificate_path, 3600)
      if (s?.signedUrl) setMsmeCertUrl(s.signedUrl)
    }
    if (data?.gst_certificate_path) {
      const { data: s } = await supabase.storage.from('vendor-documents').createSignedUrl(data.gst_certificate_path, 3600)
      if (s?.signedUrl) setGstCertUrl(s.signedUrl)
    }
    if (data?.aadhaar_copy_path) {
      const { data: s } = await supabase.storage.from('vendor-documents').createSignedUrl(data.aadhaar_copy_path, 3600)
      if (s?.signedUrl) setAadhaarUrl(s.signedUrl)
    }
    if (data?.aadhaar_pan_link_proof_path) {
      const { data: s } = await supabase.storage.from('vendor-documents').createSignedUrl(data.aadhaar_pan_link_proof_path, 3600)
      if (s?.signedUrl) setAadhaarProofUrl(s.signedUrl)
    }
    if (data?.pan_number) {
      const { data: siblings } = await supabase
        .from('vendors')
        .select('id, vendor_id, org_name, status, submitted_by')
        .eq('pan_number', data.pan_number)
        .neq('id', data.id)
      setPanSiblings(siblings || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [vendorId])

  async function handleDownloadPDF() {
    setDownloading(true); setDownloadError(null); setDownloadStep('Preparing PDF…')
    try {
      const documents = [
        { label: 'Cancelled Cheque / Bank Statement', url: chequeUrl || vendor.cancelled_cheque_drive_link, path: vendor.cancelled_cheque_path },
        { label: 'PAN Copy', url: panUrl || vendor.pan_copy_drive_link, path: vendor.pan_copy_path },
        { label: 'Registration Certificate', url: regCertUrl || vendor.registration_certificate_drive_link, path: vendor.registration_certificate_path },
        { label: 'MSME Certificate', url: msmeCertUrl || vendor.msme_certificate_drive_link, path: vendor.msme_certificate_path },
        { label: 'GST Certificate', url: gstCertUrl || vendor.gst_certificate_drive_link, path: vendor.gst_certificate_path },
        { label: 'Aadhaar Copy', url: aadhaarUrl, path: vendor.aadhaar_copy_path },
        { label: 'Aadhaar-PAN Link Proof', url: aadhaarProofUrl, path: vendor.aadhaar_pan_link_proof_path },
      ].filter(d => d.url)

      const blob = await generateVendorProfilePDF({ documents, onProgress: setDownloadStep })
      if (!blob) throw new Error('Could not generate the PDF.')
      downloadVendorProfilePDF(blob, `${vendor.vendor_id || 'vendor'}-profile.pdf`)
    } catch (err) {
      setDownloadError(err.message || 'Failed to generate PDF.')
    }
    setDownloading(false)
    setDownloadStep(null)
  }

  if (loading) return (
    <div style={{ padding: '40px 28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>
  )
  if (!vendor) return (
    <div style={{ padding: '40px 28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Vendor not found.</div>
  )

  const canEdit = !canAccessFinance(user.role) && vendor.submitted_by === user.email && vendor.status !== 'approved'
  const canApprove = canApproveVendor(user) && vendor.status === 'pending'
  const canRequestBankChange = vendor.status === 'approved' && !isObserver(user.role) &&
    (canAccessFinance(user.role) || vendor.submitted_by === user.email)

  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 28px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <span onClick={onBack} style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer' }}>{backLabel}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{vendor.vendor_id}</span>
        </div>

        {/* Header card */}
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '4px' }}>{vendor.vendor_id}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>{vendor.org_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{vendor.org_type}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <VendorStatusBadge status={vendor.status} size="lg" />
              <div style={{ display: 'flex', gap: '8px' }}>
                {canEdit && (
                  <button
                    onClick={() => onEdit(vendor)}
                    style={{ height: '30px', padding: '0 14px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Edit & Resubmit
                  </button>
                )}
                {canApprove && (
                  <button
                    onClick={() => onApprove(vendor)}
                    style={{ height: '30px', padding: '0 14px', background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Review Vendor
                  </button>
                )}
                {canRequestBankChange && (
                  <button
                    onClick={() => onBankChange(vendor)}
                    style={{ height: '30px', padding: '0 14px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Request Bank Detail Change
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0' }}>
            {[
              { label: 'Submitted By', value: getDisplayName(vendor.submitted_by) },
              { label: 'Submitted', value: fmtDate(vendor.submitted_at) },
              vendor.approved_at ? { label: 'Approved By', value: getDisplayName(vendor.approved_by) } : null,
              vendor.approved_at ? { label: 'Approved On', value: fmtDate(vendor.approved_at) } : null,
            ].filter(Boolean).map((f, i) => (
              <div key={i} style={{ padding: '12px 20px', borderRight: '1px solid var(--taupe-100)', borderBottom: '1px solid var(--taupe-100)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{f.label}</div>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace', fontSize: '11px' }}>{f.value || '—'}</div>
              </div>
            ))}
          </div>

          {vendor.rejection_reason && (
            <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: 'var(--clay-bg)', borderRadius: 'var(--radius-xs)', borderLeft: '3px solid var(--clay)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rejection Reason</div>
              <div style={{ fontSize: '12px', color: 'var(--clay-text)' }}>{vendor.rejection_reason}</div>
            </div>
          )}
          {vendor.status === 'approved' && vendor.notes && (
            <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: 'var(--moss-bg)', borderRadius: 'var(--radius-xs)', borderLeft: '3px solid var(--moss-text)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Finance Comment</div>
              <div style={{ fontSize: '12px', color: 'var(--moss-text)' }}>{vendor.notes}</div>
            </div>
          )}
        </div>

        <Section title="Organisation Details">
          <Row label="Nature of Business" value={vendor.nature_of_business} />
          <Row label="PAN Number" value={vendor.pan_number} mono />
          {panSiblings.length > 0 && (
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--taupe-100)', display: 'flex' }}>
              <div style={{ width: '200px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, paddingTop: '1px' }}>Other Vendors with this PAN</div>
              <div
                onClick={() => setShowPanModal(true)}
                style={{ fontSize: '13px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {panSiblings.length} other vendor{panSiblings.length !== 1 ? 's' : ''} — View
              </div>
            </div>
          )}
          <Row label="Registration No." value={vendor.org_registration_number} mono />
          <Row label="Registration State" value={vendor.org_registration_state} />
          <Row label="Date of Incorporation" value={fmtDate(vendor.date_of_incorporation)} />
          <Row label="MSME Registered" value={vendor.is_msme ? 'Yes' : 'No'} />
          <Row label="GSTIN Registered" value={vendor.is_gstin_registered ? 'Yes' : 'No'} />
          {vendor.gstin && <Row label="GSTIN" value={vendor.gstin} mono />}
          <Row label="Related to Organisation" value={vendor.is_related_to_org ? `Yes — ${vendor.related_org_description || ''}` : 'No'} />
        </Section>

        {AADHAAR_REQUIRED_ORG_TYPES.includes(vendor.org_type) && (
          <Section title="Aadhaar Details (Individual Vendor)">
            <Row label="Aadhaar Number" value={vendor.aadhaar_number} mono />
            <Row label="Aadhaar-PAN Linked" value={vendor.aadhaar_pan_linked ? 'Confirmed by vendor' : 'Not confirmed'} />
            <div style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {aadhaarUrl ? (
                <a href={aadhaarUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--action)', textDecoration: 'underline' }}>
                  View Aadhaar Copy
                </a>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Aadhaar copy not available</span>
              )}
              {vendor.aadhaar_pan_linked && (
                aadhaarProofUrl ? (
                  <a href={aadhaarProofUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--action)', textDecoration: 'underline' }}>
                    View Aadhaar-PAN Link Proof
                  </a>
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Link proof not available</span>
                )
              )}
            </div>
          </Section>
        )}

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
            {[
              ['Cancelled Cheque / Bank Statement', chequeUrl || vendor.cancelled_cheque_drive_link],
              ['PAN Copy', panUrl || vendor.pan_copy_drive_link],
              [!AADHAAR_REQUIRED_ORG_TYPES.includes(vendor.org_type) ? 'Registration Certificate' : null, regCertUrl || vendor.registration_certificate_drive_link],
              [vendor.is_msme ? 'MSME Certificate' : null, msmeCertUrl || vendor.msme_certificate_drive_link],
              [vendor.is_gstin_registered ? 'GST Certificate' : null, gstCertUrl || vendor.gst_certificate_drive_link],
              [AADHAAR_REQUIRED_ORG_TYPES.includes(vendor.org_type) ? 'Aadhaar Copy' : null, aadhaarUrl],
              [AADHAAR_REQUIRED_ORG_TYPES.includes(vendor.org_type) && vendor.aadhaar_pan_linked ? 'Aadhaar-PAN Link Proof' : null, aadhaarProofUrl],
              [vendor.drive_folder_link ? 'All Documents (Drive Folder)' : null, vendor.drive_folder_link],
            ].filter(([label]) => label).map(([label, url]) => (
              url ? (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '13px', color: 'var(--action)', textDecoration: 'underline' }}>
                  View {label}
                </a>
              ) : (
                <span key={label} style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{label} not available</span>
              )
            ))}
          </div>
        </Section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          {downloadError && <span style={{ fontSize: '12px', color: 'var(--clay-text)' }}>{downloadError}</span>}
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            style={{
              height: '36px', padding: '0 16px', background: downloading ? 'var(--text-muted)' : 'var(--surface-card)',
              color: downloading ? 'var(--surface-card)' : 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
              fontSize: '12px', fontWeight: 600, cursor: downloading ? 'default' : 'pointer',
            }}
          >
            {downloading ? (downloadStep || 'Preparing PDF…') : 'Download Full Profile (PDF)'}
          </button>
        </div>
      </div>

      <VendorPdfTemplate vendor={vendor} panSiblingsCount={panSiblings.length} />

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
