function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function POTemplate({ po, pr, vendor }) {
  if (!po || !pr || !vendor) return null
  return (
    <div
      id="po-template"
      style={{
        width: '794px', background: '#FFFFFF', padding: '48px',
        fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box',
        position: 'absolute', left: '-9999px', top: 0, display: 'block',
      }}
    >
      {/* Top bar */}
      <div style={{ height: '4px', background: '#1565C0', marginBottom: '32px' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', letterSpacing: '0.15em', marginBottom: '6px' }}>
            THE/NUDGE INSTITUTE
          </div>
          <div style={{ fontSize: '28px', fontFamily: 'Georgia, serif', fontWeight: 400, color: '#1A1F36' }}>
            Purchase Order
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '3px' }}>PO Number</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1565C0', fontFamily: 'monospace' }}>{po.po_number}</div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '8px' }}>{fmtDate(po.generated_at)}</div>
        </div>
      </div>

      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '28px' }} />

      {/* Vendor and PR info side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Vendor</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1F36', marginBottom: '4px' }}>{vendor.org_name}</div>
          <div style={{ fontSize: '12px', color: '#374151', marginBottom: '2px' }}>{vendor.org_type}</div>
          <div style={{ fontSize: '12px', color: '#374151', marginBottom: '2px' }}>PAN: {vendor.pan_number}</div>
          {vendor.gstin && <div style={{ fontSize: '12px', color: '#374151', marginBottom: '2px' }}>GSTIN: {vendor.gstin}</div>}
          <div style={{ fontSize: '12px', color: '#374151', marginTop: '8px' }}>{vendor.address_line1}</div>
          {vendor.address_line2 && <div style={{ fontSize: '12px', color: '#374151' }}>{vendor.address_line2}</div>}
          <div style={{ fontSize: '12px', color: '#374151' }}>{vendor.city}, {vendor.state} — {vendor.pincode}</div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#374151' }}>Contact: {vendor.contact_person}</div>
          <div style={{ fontSize: '12px', color: '#374151' }}>{vendor.phone} · {vendor.email}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Purchase Request</div>
          {[
            ['PR Number', pr.pr_number],
            ['Entity', pr.entity],
            ['Category', pr.category],
            ['Program', pr.program],
            ['Purpose', pr.purpose],
            ['Requested By', pr.requested_by],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '12px' }}>
              <span style={{ color: '#9CA3AF', width: '110px', flexShrink: 0 }}>{label}</span>
              <span style={{ color: '#374151' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div style={{ background: '#F8F9FA', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '20px 24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', color: '#374151' }}>Total Order Value</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A1F36', fontFamily: 'monospace' }}>
            INR {Number(po.amount || 0).toLocaleString('en-IN')}
          </div>
        </div>
        {(pr.base_amount != null || pr.tax_amount != null) && (
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #E3E8EF' }}>
            {[
              ['Base Amount', pr.base_amount],
              ['Tax (GST)', pr.tax_amount != null ? pr.tax_amount : pr.gst_amount],
              ['Incidentals', Number(pr.incidental_amount) > 0 ? pr.incidental_amount : null],
            ].filter(([, v]) => v != null).map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#374151', marginBottom: '4px' }}>
                <span style={{ color: '#9CA3AF' }}>{label}</span>
                <span style={{ fontFamily: 'monospace' }}>INR {Number(val).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}
        {pr.advance_percent != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#374151', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E3E8EF' }}>
            <span style={{ color: '#9CA3AF' }}>Payment Terms</span>
            <span>{Number(pr.advance_percent)}% advance · {pr.after_delivery_percent != null ? Number(pr.after_delivery_percent) : 100 - Number(pr.advance_percent)}% after delivery</span>
          </div>
        )}
      </div>

      {/* Bank details */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Payment to</div>
        {[
          ['Beneficiary', vendor.beneficiary_name],
          ['Account No.', vendor.account_number],
          ['IFSC', vendor.ifsc_code],
          ['Bank', vendor.bank_name + ' — ' + vendor.branch],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '5px', fontSize: '12px' }}>
            <span style={{ color: '#9CA3AF', width: '110px', flexShrink: 0 }}>{label}</span>
            <span style={{ color: '#374151', fontFamily: label === 'Account No.' || label === 'IFSC' ? 'monospace' : 'inherit' }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '20px' }} />

      {/* Footer */}
      <div style={{ fontSize: '10px', color: '#9CA3AF', lineHeight: 1.6 }}>
        This purchase order is issued by The/Nudge Institute. Payment will be processed upon receipt of goods/services as per agreed terms.
        For queries, contact the Finance team. This is a computer-generated document.
      </div>
      <div style={{ height: '4px', background: '#1565C0', marginTop: '28px' }} />
    </div>
  )
}
