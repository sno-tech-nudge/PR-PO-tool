import { lineNet } from '../../lib/deductions'
import { lineLabel } from '../../lib/paymentSplit'

const money = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
const num = v => Number(v) || 0

const th = { fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 6px', textAlign: 'left' }
const td = { fontSize: '12px', color: 'var(--ink)', padding: '5px 0', borderTop: '1px solid var(--taupe-200)', verticalAlign: 'top' }
const right = { textAlign: 'right', whiteSpace: 'nowrap' }

// How a vendor invoice was split once Accounts worked on it: each line item with
// its own category and TDS, then incidentals and GST (neither carries TDS), the
// total, the TDS taken and what is paid. For the Finance team. Shows nothing
// until a split has been saved.
export default function PaymentSplit({ expense, title = 'Payment split' }) {
  const lines = Array.isArray(expense?.tds_breakdown) ? expense.tds_breakdown : []
  const hasSplit = lines.length > 0 || num(expense?.gst_amount) > 0 || num(expense?.other_amount) > 0
  if (!expense || !hasSplit) return null

  const base = lines.length ? lines.reduce((s, l) => s + num(l.amount), 0) : num(expense.base_amount)
  const tds = num(expense.tds_amount)
  const lineSum = lines.reduce((s, l) => s + num(l.tds), 0)
  const adjusted = tds > 0 && lines.length > 0 && Math.round(lineSum) !== Math.round(tds)

  return (
    <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', padding: '10px 12px', margin: '8px 0' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Item</th>
            <th style={{ ...th, ...right }}>Amount</th>
            <th style={{ ...th, ...right }}>TDS</th>
          </tr>
        </thead>
        <tbody>
          {lines.length > 0 ? lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>
                {lineLabel(l)}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {l.section && num(l.tds) > 0 ? `${l.section} at ${l.rate}%` : 'No TDS'}
                </div>
              </td>
              <td style={{ ...td, ...right }}>{money(l.amount)}</td>
              <td style={{ ...td, ...right }}>{num(l.tds) > 0 ? money(l.tds) : '—'}</td>
            </tr>
          )) : (
            <tr>
              <td style={td}>Base amount</td>
              <td style={{ ...td, ...right }}>{money(base)}</td>
              <td style={{ ...td, ...right }}>{tds > 0 ? money(tds) : '—'}</td>
            </tr>
          )}
          {num(expense.other_amount) > 0 && (
            <tr>
              <td style={td}>Incidentals<div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No TDS</div></td>
              <td style={{ ...td, ...right }}>{money(expense.other_amount)}</td>
              <td style={{ ...td, ...right }}>—</td>
            </tr>
          )}
          {num(expense.gst_amount) > 0 && (
            <tr>
              <td style={td}>GST<div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No TDS</div></td>
              <td style={{ ...td, ...right }}>{money(expense.gst_amount)}</td>
              <td style={{ ...td, ...right }}>—</td>
            </tr>
          )}
          <tr>
            <td style={{ ...td, fontWeight: 700 }}>Invoice total</td>
            <td style={{ ...td, ...right, fontWeight: 700 }}>{money(expense.amount)}</td>
            <td style={{ ...td, ...right, fontWeight: 700 }}>{tds > 0 ? money(tds) : '—'}</td>
          </tr>
        </tbody>
      </table>
      {adjusted && (
        <div style={{ fontSize: '11px', color: 'var(--gold-text)', marginTop: '6px' }}>
          Accounts changed the TDS to {money(tds)} (the lines add up to {money(lineSum)}).
        </div>
      )}
      {num(expense.deduction_amount) > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--ink)', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Deducted by Accounts</span><span>{money(expense.deduction_amount)}</span>
        </div>
      )}
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Net payable to the vendor</span><span>{money(lineNet(expense, 'vendor'))}</span>
      </div>
    </div>
  )
}
