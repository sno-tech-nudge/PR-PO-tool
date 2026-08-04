import { breakdownTotals } from '../../lib/formCalc'

// Amount breakdown: Base + Tax (mandatory) + Incidentals (optional) → computed Total.
// Controlled component. value = { base, tax, incidental }; onChange gets the next value.
// Callers derive total/valid via breakdownTotals() from lib/formCalc.

function money(val, onChange, placeholder, invalid) {
  return (
    <input
      type="number"
      value={val}
      onChange={e => onChange(e.target.value)}
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
  const { total } = breakdownTotals(value)
  const set = patch => onChange({ ...value, ...patch })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
            Base Amount<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
          </label>
          {money(value.base ?? '', v => set({ base: v }), '0', !!errors.base)}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
            Tax (GST)<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
          </label>
          {money(value.tax ?? '', v => set({ tax: v }), '0', !!errors.tax)}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
            Incidentals
          </label>
          {money(value.incidental ?? '', v => set({ incidental: v }), 'Optional', false)}
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
