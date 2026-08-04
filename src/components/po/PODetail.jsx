import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

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
  issued:    { label: 'Issued',    color: '#8C3225', bg: '#fdf0ed' },
  completed: { label: 'Completed', color: '#15803D', bg: '#F0FDF4' },
  cancelled: { label: 'Cancelled', color: '#B91C1C', bg: '#FEF2F2' },
}

export default function PODetail({ poId, user, onBack }) {
  const [po, setPO]         = useState(null)
  const [pr, setPR]         = useState(null)
  const [vendor, setVendor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [markingDone, setMarkingDone] = useState(false)

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

    const [{ data: prData }, { data: vendorData }] = await Promise.all([
      supabase.from('purchase_requests').select('*').eq('id', poData.pr_id).single(),
      supabase.from('vendors').select('*').eq('id', poData.vendor_id).single(),
    ])
    setPR(prData)
    setVendor(vendorData)

    if (poData.pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from('po-pdfs')
        .createSignedUrl(poData.pdf_storage_path, 3600)
      if (signed?.signedUrl) setPdfUrl(signed.signedUrl)
    }

    setLoading(false)
  }

  async function handleMarkCompleted() {
    setMarkingDone(true)
    await supabase.from('purchase_orders').update({ status: 'completed' }).eq('id', poId)
    setPO(prev => ({ ...prev, status: 'completed' }))
    setMarkingDone(false)
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
  const isFinance = user.role === 'finance'

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 24px 60px' }}>
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
                  background: '#8C3225', color: '#FFFFFF',
                  border: 'none', borderRadius: '5px', cursor: 'pointer',
                  textDecoration: 'none', display: 'inline-block',
                }}
              >
                ↓ Download PO PDF
              </a>
            )}
          </div>
        </div>

        <div style={{ height: '1px', background: '#F3F4F6', marginBottom: '16px' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
          <div>
            <Row label="PO Number"  value={po.po_number} mono />
            <Row label="Entity"     value={po.entity} />
            <Row label="Issued On"  value={fmtDate(po.generated_at)} />
          </div>
          <div>
            <Row label="Linked PR"  value={pr?.pr_number} mono />
            <Row label="Requested By" value={pr?.requested_by} />
            <Row label="Category"   value={pr?.category} />
          </div>
        </div>
      </div>

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

      {/* PR purpose */}
      {pr?.purpose && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Purpose
          </div>
          <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>{pr.purpose}</div>
        </div>
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
