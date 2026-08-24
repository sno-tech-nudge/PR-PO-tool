import { getEntityAddress, getEntityCity } from '../../lib/orgEntities'
import { amountInWords } from '../../lib/numberToWords'
import { PO_TERMS_INTRO, PO_TERMS_CLAUSES } from '../../lib/poTermsAndConditions'

const BROWN = '#8C3225'
const BORDER = '#D9C2BB'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toISOString().slice(0, 10)
}

function fmtAmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function quoteReferenceText(pr) {
  if (pr?.single_source_justification) {
    const name = pr.quotes?.[0]?.vendor_name
    return name ? `Single source — ${name}` : 'Single source procurement'
  }
  const names = (pr?.quotes || []).map(q => q.vendor_name).filter(Boolean)
  if (!names.length) return '—'
  return names.map((n, i) => (i === 0 ? `From ${n}` : `Quotation from ${n}`)).join(', ')
}

function vendorAddressLines(vendor) {
  return [
    vendor.address_line1,
    vendor.address_line2,
    [vendor.city, vendor.state].filter(Boolean).join(', ') + (vendor.pincode ? `, ${vendor.pincode}` : ''),
  ].filter(Boolean)
}

// Field-labelled cell used throughout the cover page's info table.
function Cell({ label, children, style }) {
  return (
    <td style={{ border: `1px solid ${BORDER}`, padding: '10px 12px', verticalAlign: 'top', fontSize: '11px', color: '#374151', ...style }}>
      <div style={{ fontWeight: 700, color: BROWN, marginBottom: '4px' }}>{label}</div>
      <div style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>{children}</div>
    </td>
  )
}

export default function POTemplate({ po, pr, vendor }) {
  if (!po || !pr || !vendor) return null

  const entity = pr.entity || ''
  const entityAddress = getEntityAddress(entity) || '—'
  const entityCity = getEntityCity(entity) || '—'
  const quantity = pr.quantity != null ? pr.quantity : 1
  const ratePerUnit = pr.rate_per_unit != null ? pr.rate_per_unit : pr.base_amount
  const taxAmount = pr.tax_amount != null ? pr.tax_amount : pr.gst_amount
  const subTotal = po.amount

  return (
    <>
      {/* ── Page 1: PO cover / details ── */}
      <div
        id="po-template-cover"
        style={{
          width: '794px', background: '#FFFFFF', padding: '40px',
          fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box',
          position: 'absolute', left: '-9999px', top: 0, display: 'block', color: '#1A1F36',
        }}
      >
        <div style={{ height: '5px', background: BROWN, marginBottom: '20px' }} />

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '4px' }}>
          THE/NUDGE INSTITUTE
        </div>
        <div style={{ fontSize: '26px', fontFamily: 'Georgia, serif', fontWeight: 700, color: BROWN, textAlign: 'center', marginBottom: '18px' }}>
          Purchase Order
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
          <tbody>
            <tr>
              <Cell label="Entity Name & Address :" style={{ width: '50%' }}>
                {entity}{entityAddress ? `\n${entityAddress}` : ''}
              </Cell>
              <td style={{ border: `1px solid ${BORDER}`, padding: '0', verticalAlign: 'top' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '10px 12px', fontSize: '11px', borderBottom: `1px solid ${BORDER}` }}>
                        <div style={{ fontWeight: 700, color: BROWN, marginBottom: '4px' }}>PO Number:</div>
                        <div style={{ fontFamily: 'monospace' }}>{po.po_number}</div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '11px', borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}` }}>
                        <div style={{ fontWeight: 700, color: BROWN, marginBottom: '4px' }}>Date:</div>
                        <div>{fmtDate(po.generated_at)}</div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ padding: '10px 12px', fontSize: '11px' }}>
                        <div style={{ fontWeight: 700, color: BROWN, marginBottom: '4px' }}>Quote Reference Number:</div>
                        <div style={{ lineHeight: 1.5 }}>{quoteReferenceText(pr)}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <Cell label="Billing Address:">
                {entity}{entityAddress ? `\n${entityAddress}` : ''}
              </Cell>
              <Cell label="Place of Delivery:">
                {entityCity}
              </Cell>
            </tr>
            <tr>
              <Cell label="Name & Address of Supplier:">
                {vendor.org_name}
                {vendorAddressLines(vendor).length ? `\n${vendorAddressLines(vendor).join('\n')}` : ''}
              </Cell>
              <Cell label="Shipping Address:">
                {entity}{entityAddress ? `\n${entityAddress}` : ''}
              </Cell>
            </tr>
            <tr>
              <Cell label="Dispatch/ Delivery through:">—</Cell>
              <Cell label=" "> </Cell>
            </tr>
          </tbody>
        </table>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
          <thead>
            <tr style={{ background: '#fdf0ed' }}>
              {['Sl. No.', 'Description of goods/ services', 'Quantity', 'Rate per unit (in INR)', 'Tax', 'Sub Total'].map(h => (
                <th key={h} style={{ border: `1px solid ${BORDER}`, padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: BROWN, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: `1px solid ${BORDER}`, padding: '10px', fontSize: '12px', textAlign: 'center' }}>1</td>
              <td style={{ border: `1px solid ${BORDER}`, padding: '10px', fontSize: '12px' }}>{pr.purpose || pr.category || '—'}</td>
              <td style={{ border: `1px solid ${BORDER}`, padding: '10px', fontSize: '12px', textAlign: 'center' }}>{quantity}</td>
              <td style={{ border: `1px solid ${BORDER}`, padding: '10px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtAmt(ratePerUnit)}</td>
              <td style={{ border: `1px solid ${BORDER}`, padding: '10px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtAmt(taxAmount)}</td>
              <td style={{ border: `1px solid ${BORDER}`, padding: '10px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmtAmt(subTotal)}</td>
            </tr>
            <tr>
              <td colSpan={5} style={{ border: `1px solid ${BORDER}`, padding: '8px 10px', fontSize: '12px', fontWeight: 700, textAlign: 'right', background: '#F8F9FA' }}>Total:</td>
              <td style={{ border: `1px solid ${BORDER}`, padding: '8px 10px', fontSize: '12px', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', background: '#F8F9FA' }}>{fmtAmt(subTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: '11px', color: '#374151', marginTop: '12px' }}>
          <strong>Amount in words:</strong> {amountInWords(subTotal)} Rupees Only
        </div>

        {/* Short terms block */}
        <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: BROWN, marginBottom: '6px' }}>Terms & Conditions:</div>
          <div style={{ fontSize: '10.5px', color: '#374151', lineHeight: 1.7 }}>
            Refer to standard terms and conditions attached to this PO<br />
            PO will be valid for 90 days<br />
            {pr.payment_terms === 'credit'
              ? <>Payment terms: For {entity} — Credit Term {pr.credit_term_frequency || ''}{pr.credit_term_date ? `, due ${fmtDate(pr.credit_term_date)}` : ''}<br /></>
              : <>Payment terms: For {entity} — Advance {pr.advance_percent != null ? Number(pr.advance_percent) : 0}%<br /></>
            }
            This is a system generated document, and it does not require the signature.
          </div>
        </div>

        <div style={{ height: '5px', background: BROWN, marginTop: '24px' }} />
      </div>

      {/* ── Page 2+: Terms and Conditions (Appendix A), verbatim, our layout ── */}
      <div
        id="po-template-terms"
        style={{
          width: '794px', background: '#FFFFFF', padding: '40px',
          fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box',
          position: 'absolute', left: '-9999px', top: 0, display: 'block', color: '#1A1F36',
        }}
      >
        <div style={{ height: '5px', background: BROWN, marginBottom: '20px' }} />
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '4px' }}>
          APPENDIX A
        </div>
        <div style={{ fontSize: '20px', fontFamily: 'Georgia, serif', fontWeight: 700, color: BROWN, textAlign: 'center', marginBottom: '18px' }}>
          Terms and Conditions
        </div>

        <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.7, marginBottom: '16px' }}>
          {PO_TERMS_INTRO}
        </div>

        {PO_TERMS_CLAUSES.map((text, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '10px', fontSize: '10.5px', color: '#374151', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700, color: BROWN, flexShrink: 0, width: '20px' }}>{i + 1}.</span>
            <span>{text}</span>
          </div>
        ))}

        <div style={{ height: '5px', background: BROWN, marginTop: '24px' }} />
      </div>
    </>
  )
}
