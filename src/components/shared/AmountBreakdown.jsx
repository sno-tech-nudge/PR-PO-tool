import { lineItemsBase, breakdownTotals } from '../../lib/formCalc'
import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'
import { PR_CATEGORIES } from '../../lib/prConstants'
import AmountInput from './AmountInput'

// Amount breakdown: one or more line items (Description x Quantity x
// Category x Rate per Unit) → summed Base, + Tax (mandatory) + Incidentals
// (optional) → computed Total. Category lives per line item (not once for
// the whole PR) since different items on the same request can fall under
// different categories of service. Controlled component.
// value = { items: [{ description, quantity, category, ratePerUnit }], tax, incidental }

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
        width: '100%', height: '38px', border: `1px solid ${invalid ? 'var(--clay-text)' : 'var(--taupe-400)'}`,
        borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', color: 'var(--ink)',
        background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
      }}
    />
  )
}

const EMPTY_ITEM = { description: '', quantity: '', category: '', ratePerUnit: '' }

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
            <div key={i} style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: '#FAFBFC' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={it.description}
                  onChange={e => updateItem(i, { description: e.target.value })}
                  placeholder={`Item ${i + 1} description (optional)`}
                  style={{ flex: 1, height: '34px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box' }}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    title="Remove this line item"
                    style={{ height: '34px', width: '34px', flexShrink: 0, background: 'var(--surface-card)', color: 'var(--clay-text)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', fontSize: '15px', cursor: 'pointer', lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Quantity<span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>
                  </label>
                  {countField(it.quantity, v => updateItem(i, { quantity: v }), '1', !!errors.base)}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Category of Service<span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>
                  </label>
                  <select
                    value={it.category || ''}
                    onChange={e => updateItem(i, { category: e.target.value })}
                    style={{
                      width: '100%', height: '38px', border: `1px solid ${errors.category && !it.category ? 'var(--clay-text)' : 'var(--taupe-400)'}`,
                      borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: '13px', color: it.category ? 'var(--ink)' : 'var(--text-muted)',
                      background: 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
                    }}
                  >
                    <option value="">Select…</option>
                    {PR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Rate per Unit (without tax)<span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>
                  </label>
                  <AmountInput value={it.ratePerUnit} onChange={v => updateItem(i, { ratePerUnit: v })} error={!!errors.base} />
                </div>
              </div>
              {it.quantity !== '' && it.ratePerUnit !== '' && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Amount: <strong style={{ color: 'var(--ink)' }}>₹{rowAmount.toLocaleString('en-IN')}</strong>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addItem}
        style={{ height: '32px', padding: '0 14px', marginBottom: '14px', background: 'var(--surface-card)', color: 'var(--action)', border: '1px solid var(--action)', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
      >
        + Add Line Item
      </button>

      {computedBase > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Base Amount ({items.length} item{items.length > 1 ? 's' : ''}): <strong style={{ color: 'var(--ink)' }}>₹{computedBase.toLocaleString('en-IN')}</strong>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '5px' }}>
            Tax (GST)<span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>
          </label>
          <AmountInput value={value.tax ?? ''} onChange={v => set({ tax: v })} error={!!errors.tax} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '5px' }}>
            Incidentals
          </label>
          <AmountInput value={value.incidental ?? ''} onChange={v => set({ incidental: v })} placeholder="Optional" />
        </div>
      </div>

      {(errors.base || errors.tax) && (
        <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '4px' }}>
          {errors.base || errors.tax}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', padding: '10px 12px', background: 'var(--taupe-50)', borderRadius: 'var(--radius-sm)' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Amount (base + tax + incidentals)</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>
          ₹{total.toLocaleString('en-IN')}
        </span>
      </div>
    </div>
  )
}
