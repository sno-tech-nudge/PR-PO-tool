import { breakdownTotals } from '../../lib/formCalc'
import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'
import AmountInput from './AmountInput'

// Amount breakdown: Quantity × Rate per Unit → computed Base, + Tax
// (mandatory) + Incidentals (optional) → computed Total.
// Controlled component. value = { quantity, ratePerUnit, base, tax, incidental };
// base is derived here (quantity * ratePerUnit) and included in what's emitted
// to onChange, so callers deriving total/valid via breakdownTotals() from
// lib/formCalc need no changes. Rate per Unit only appears once a quantity has
// been entered, matching the source Zoho form's reveal-on-input behaviour.
// Quantity is a plain count (no currency styling); Rate/Tax/Incidentals are
// real money, so they get the ₹-prefixed, thousands-grouped AmountInput.

function countField(val, onChange, placeholder, invalid) {
  return (
    <input
      type="number"
      value={val}
      onChange={e => onChange(sanitizeNumericValue(e.target.value))}
      onKeyDown={blockNonNumericKey}
      onPaste={sanitizeNumericPaste}
      placeholder={placeholder}
      min="0"
      style={{
        width: '100%', height: '38px', border: `1px solid ${invalid ? '#DC2626' : '#D1D5DB'}`,
        borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#1A1F36',
        background: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
      }}
    />
  )
}

export default function AmountBreakdown({ value = {}, onChange, errors = {} }) {
  const quantity = value.quantity ?? ''
  const ratePerUnit = value.ratePerUnit ?? ''
  const computedBase = (Number(quantity) || 0) * (Number(ratePerUnit) || 0)
  const { total } = breakdownTotals({ ...value, base: computedBase })
  const set = patch => {
    const next = { ...value, ...patch }
    const q = Number(next.quantity) || 0
    const r = Number(next.ratePerUnit) || 0
    onChange({ ...next, base: q * r })
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: quantity !== '' ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
            Quantity<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
          </label>
          {countField(quantity, v => set({ quantity: v }), '1', !!errors.base)}
        </div>
        {quantity !== '' && (
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
              Rate per Unit (without tax)<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
            </label>
            <AmountInput value={ratePerUnit} onChange={v => set({ ratePerUnit: v })} error={!!errors.base} />
          </div>
        )}
      </div>

      {quantity !== '' && ratePerUnit !== '' && (
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
          Base Amount: <strong style={{ color: '#1A1F36' }}>₹{computedBase.toLocaleString('en-IN')}</strong> ({quantity} × ₹{Number(ratePerUnit).toLocaleString('en-IN')})
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
            Tax (GST)<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
          </label>
          <AmountInput value={value.tax ?? ''} onChange={v => set({ tax: v })} error={!!errors.tax} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
            Incidentals
          </label>
          <AmountInput value={value.incidental ?? ''} onChange={v => set({ incidental: v })} placeholder="Optional" />
        </div>
      </div>

      {(errors.base || errors.tax) && (
        <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>
          {errors.base || errors.tax}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', padding: '10px 12px', background: '#F9FAFB', borderRadius: '4px' }}>
        <span style={{ fontSize: '12px', color: '#6B7280' }}>Total Amount (base + tax + incidentals)</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A1F36', fontFamily: 'monospace' }}>
          ₹{total.toLocaleString('en-IN')}
        </span>
      </div>
    </div>
  )
}
