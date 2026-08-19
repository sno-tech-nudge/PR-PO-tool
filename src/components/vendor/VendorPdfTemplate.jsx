const AADHAAR_REQUIRED_ORG_TYPES = ['Individual/Freelancer', 'Proprietorship']

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PdfRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #F0F0F0' }}>
      <div style={{ width: '220px', flexShrink: 0, fontSize: '10px', color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#1A1A1A' }}>{value}</div>
    </div>
  )
}

function PdfSection({ title, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid #1A1A1A' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// Off-screen (position: absolute; left: -9999px) print template — same
// pattern as PDFTemplate.jsx / POTemplate.jsx — captured by html2canvas via
// generateVendorProfilePDF(), never shown on screen directly. Kept free of
// buttons/interactive chrome so the resulting PDF page is clean.
export default function VendorPdfTemplate({ vendor, panSiblingsCount = 0 }) {
  if (!vendor) return null
  const isIndividual = AADHAAR_REQUIRED_ORG_TYPES.includes(vendor.org_type)

  return (
    <div
      id="vendor-pdf-template"
      style={{
        position: 'absolute', left: '-9999px', top: 0,
        width: '794px', background: '#FFFFFF', boxSizing: 'border-box',
        padding: '40px', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B6B6B', letterSpacing: '0.15em' }}>
        THE/NUDGE INSTITUTE — VENDOR PROFILE
      </div>
      <div style={{ height: '1px', background: '#E8E8E8', margin: '8px 0 24px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginBottom: '4px' }}>{vendor.vendor_id}</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A1A1A' }}>{vendor.org_name}</div>
          <div style={{ fontSize: '13px', color: '#6B6B6B', marginTop: '2px' }}>{vendor.org_type}</div>
        </div>
        <div style={{
          fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '2px',
          background: vendor.status === 'approved' ? '#F0FDF4' : vendor.status === 'rejected' ? '#FEF2F2' : '#FFFBEB',
          color: vendor.status === 'approved' ? '#15803D' : vendor.status === 'rejected' ? '#B91C1C' : '#B45309',
          textTransform: 'uppercase',
        }}>
          {vendor.status}
        </div>
      </div>

      <PdfSection title="Organisation Details">
        <PdfRow label="Nature of Business" value={vendor.nature_of_business} />
        <PdfRow label="PAN Number" value={vendor.pan_number} />
        {panSiblingsCount > 0 && <PdfRow label="Other Vendors with this PAN" value={`${panSiblingsCount} other vendor${panSiblingsCount !== 1 ? 's' : ''}`} />}
        <PdfRow label="Registration No." value={vendor.org_registration_number} />
        <PdfRow label="Registration State" value={vendor.org_registration_state} />
        <PdfRow label="Date of Incorporation" value={fmtDate(vendor.date_of_incorporation)} />
        <PdfRow label="MSME Registered" value={vendor.is_msme ? 'Yes' : 'No'} />
        <PdfRow label="GSTIN Registered" value={vendor.is_gstin_registered ? 'Yes' : 'No'} />
        {vendor.gstin && <PdfRow label="GSTIN" value={vendor.gstin} />}
        <PdfRow label="Related to Organisation" value={vendor.is_related_to_org ? `Yes — ${vendor.related_org_description || ''}` : 'No'} />
      </PdfSection>

      {isIndividual && (
        <PdfSection title="Aadhaar Details (Individual Vendor)">
          <PdfRow label="Aadhaar Number" value={vendor.aadhaar_number} />
          <PdfRow label="Aadhaar-PAN Linked" value={vendor.aadhaar_pan_linked ? 'Confirmed by vendor' : 'Not confirmed'} />
        </PdfSection>
      )}

      <PdfSection title="Contact & Address">
        <PdfRow label="Contact Person" value={vendor.contact_person} />
        <PdfRow label="Phone" value={vendor.phone} />
        <PdfRow label="Email" value={vendor.email} />
        {vendor.website && <PdfRow label="Website" value={vendor.website} />}
        <PdfRow label="Address" value={[vendor.address_line1, vendor.address_line2].filter(Boolean).join(', ')} />
        <PdfRow label="City / State / Pin" value={`${vendor.city}, ${vendor.state} — ${vendor.pincode}`} />
        <PdfRow label="Country" value={vendor.country} />
      </PdfSection>

      <PdfSection title="Bank Account">
        <PdfRow label="Beneficiary Name" value={vendor.beneficiary_name} />
        <PdfRow label="Account Number" value={vendor.account_number} />
        <PdfRow label="IFSC Code" value={vendor.ifsc_code} />
        <PdfRow label="Bank" value={vendor.bank_name} />
        <PdfRow label="Branch" value={vendor.branch} />
      </PdfSection>

      <PdfSection title="Approval">
        <PdfRow label="Submitted By" value={vendor.submitted_by} />
        <PdfRow label="Submitted On" value={fmtDate(vendor.submitted_at)} />
        {vendor.approved_at && <PdfRow label="Approved By" value={vendor.approved_by} />}
        {vendor.approved_at && <PdfRow label="Approved On" value={fmtDate(vendor.approved_at)} />}
        {vendor.status === 'rejected' && <PdfRow label="Rejection Reason" value={vendor.rejection_reason} />}
        {vendor.status === 'approved' && vendor.notes && <PdfRow label="Finance Comment" value={vendor.notes} />}
      </PdfSection>

      <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #E8E8E8' }}>
        Generated {new Date().toLocaleString('en-IN')} · attached documents follow on the pages after this overview
      </div>
    </div>
  )
}
