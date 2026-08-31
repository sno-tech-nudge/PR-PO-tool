import { lineItemsBase, breakdownTotals } from '../../lib/formCalc'
import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'
import AmountInput from './AmountInput'

// Amount breakdown: one or more line items (Description x Quantity x Rate
// per Unit) → summed Base, + Tax (mandatory) + Incidentals (optional) →
// computed Total. Controlled component.
// value = { items: [{ description, quantity, ratePerUnit }], tax, incidental }

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

const EMPTY_ITEM = { description: '', quantity: '', ratePerUnit: '' }

export default function AmountBreakdown({ value = {}, onChange, errors = {} }) {
  const items = value.items?.length ? value.items : [EMPTY_ITEM]
  const computedBase = lineItemsBase(items)
  const { total } = breakdownTotals({ ...value, base: computedBase })

  function setItems(nextItems) {
    onChange({ ...value, items: nextItems })
  }
  function updateItem(i, patch) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function addItem() {
    setItems([...items, EMPTY_ITEM])
  }
  function removeItem(i) {
    setItems(items.filter((_, idx) => idx !== i))
  }
  function set(patch) {
    onChange({ ...value, ...patch })
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
        {items.map((it, i) => {
          const rowAmount = (Number(it.quantity) || 0) * (Number(it.ratePerUnit) || 0)
          return (
            <div key={i} style={{ border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px 12px', background: '#FAFBFC' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={it.description}
                  onChange={e => updateItem(i, { description: e.target.value })}
                  placeholder={`Item ${i + 1} description (optional)`}
                  style={{ flex: 1, height: '34px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#1A1F36', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    title="Remove this line item"
                    style={{ height: '34px', width: '34px', flexShrink: 0, background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '4px', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>
                    Quantity<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
                  </label>
                  {countField(it.quantity, v => updateItem(i, { quantity: v }), '1', !!errors.base)}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>
                    Rate per Unit (without tax)<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
                  </label>
                  <AmountInput value={it.ratePerUnit} onChange={v => updateItem(i, { ratePerUnit: v })} error={!!errors.base} />
                </div>
              </div>
              {it.quantity !== '' && it.ratePerUnit !== '' && (
                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '6px' }}>
                  Amount: <strong style={{ color: '#1A1F36' }}>₹{rowAmount.toLocaleString('en-IN')}</strong>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addItem}
        style={{ height: '32px', padding: '0 14px', marginBottom: '14px', background: '#FFFFFF', color: '#8C3225', border: '1px solid #8C3225', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
      >
        + Add Line Item
      </button>

      {computedBase > 0 && (
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
          Base Amount ({items.length} item{items.length > 1 ? 's' : ''}): <strong style={{ color: '#1A1F36' }}>₹{computedBase.toLocaleString('en-IN')}</strong>
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
