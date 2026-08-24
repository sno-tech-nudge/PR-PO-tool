import AmountInput from '../shared/AmountInput'
import QuoteUpload from './QuoteUpload'

// Quotes captured as rows (Zoho-style): each row = one vendor quote with
// vendor name, amount, an uploaded document, and a "selected vendor" radio.
// Policy requires `requiredQuotes` rows unless a single-source justification is given.
// Callers derive validity via quotesValidity() from lib/formCalc.
//
// value:    { quotes: [{ vendor_name, amount, quote_path, selected }], singleSource, singleSourceJustification }
// onChange: (nextValue) => void

const blankQuote = () => ({ vendor_name: '', amount: '', quote_path: '', selected: false })

export default function QuoteRows({ value = {}, onChange, requiredQuotes = 2, error }) {
  // Single source still needs exactly one attached quotation; normal mode
  // needs at least `requiredQuotes` rows.
  const quotes = (() => {
    const q = [...(value.quotes || [])]
    const min = value.singleSource ? 1 : requiredQuotes
    while (q.length < min) q.push(blankQuote())
    return q
  })()

  const set = patch => onChange({ ...value, ...patch })

  function updateQuote(idx, patch) {
    const next = quotes.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    set({ quotes: next })
  }

  function selectWinner(idx) {
    set({ quotes: quotes.map((q, i) => ({ ...q, selected: i === idx })) })
  }

  function addRow() { set({ quotes: [...quotes, blankQuote()] }) }
  function removeRow(idx) {
    if (quotes.length <= requiredQuotes) return
    set({ quotes: quotes.filter((_, i) => i !== idx) })
  }

  return (
    <div>
      {/* Single-source toggle */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#374151' }}>
          <input
            type="checkbox"
            checked={!!value.singleSource}
            onChange={e => set({ singleSource: e.target.checked })}
            style={{ width: '16px', height: '16px' }}
          />
          Only one vendor available (Single Source Justification)
        </label>
      </div>

      {value.singleSource ? (
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
            Single Source Justification<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
          </label>
          <textarea
            value={value.singleSourceJustification || ''}
            onChange={e => set({ singleSourceJustification: e.target.value })}
            placeholder="Explain why this procurement can only be done from a single vendor (proprietary product, sole distributor, technical reasons, etc.)"
            rows={4}
            style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '10px', fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />

          {/* Even a single-vendor purchase still needs its one quotation attached */}
          <div style={{ marginTop: '14px', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '14px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>Quotation</div>
            <QuoteUpload
              skipExtraction
              onFileUploaded={path => updateQuote(0, { quote_path: path, selected: true })}
            />
            <div style={{ fontSize: '11px', color: quotes[0].quote_path ? '#15803D' : '#9CA3AF', marginTop: '6px' }}>
              {quotes[0].quote_path ? '✓ Document uploaded' : 'Document not uploaded'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {quotes.map((q, idx) => (
            <div key={idx} style={{ border: '1px solid #E3E8EF', borderRadius: '6px', padding: '14px', background: q.selected ? '#F0FDF4' : '#FFFFFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                  <input
                    type="radio"
                    name="quote-winner"
                    checked={!!q.selected}
                    onChange={() => selectWinner(idx)}
                    style={{ width: '15px', height: '15px' }}
                  />
                  Quote {idx + 1}{q.selected ? ' — Selected vendor' : ''}
                </label>
                {quotes.length > requiredQuotes && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    style={{ background: 'none', border: 'none', color: '#B91C1C', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '3px' }}>Vendor name</div>
                  <input
                    value={q.vendor_name}
                    onChange={e => updateQuote(idx, { vendor_name: e.target.value })}
                    placeholder="Vendor / supplier"
                    style={{ width: '100%', height: '34px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 8px', fontSize: '12px', color: '#1A1F36', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '3px' }}>Quote amount</div>
                  <AmountInput
                    value={q.amount}
                    onChange={v => updateQuote(idx, { amount: v })}
                    inputStyle={{ height: '34px', fontSize: '12px' }}
                  />
                </div>
              </div>

              <QuoteUpload
                onExtracted={data => {
                  // Auto-fill row fields from the AI extraction where empty.
                  const patch = {}
                  if (data?.vendor_name && !q.vendor_name) patch.vendor_name = data.vendor_name
                  if (data?.total_amount != null && !q.amount) patch.amount = String(data.total_amount)
                  if (Object.keys(patch).length) updateQuote(idx, patch)
                }}
                onFileUploaded={path => updateQuote(idx, { quote_path: path })}
              />
              <div style={{ fontSize: '11px', color: q.quote_path ? '#15803D' : '#9CA3AF', marginTop: '6px' }}>
                {q.quote_path ? '✓ Document uploaded' : 'Document not uploaded'}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #C4826F', color: '#8C3225', fontSize: '12px', cursor: 'pointer', borderRadius: '4px', padding: '6px 12px' }}
          >
            + Add another quote
          </button>

          {/* Comparing multiple vendors requires a comparative statement */}
          <div style={{ border: '1px solid #E3E8EF', borderRadius: '6px', padding: '14px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
              Comparative Statement<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
            </div>
            <QuoteUpload
              skipExtraction
              onFileUploaded={path => set({ comparative_statement_path: path })}
            />
            <div style={{ fontSize: '11px', color: value.comparative_statement_path ? '#15803D' : '#9CA3AF', marginTop: '6px' }}>
              {value.comparative_statement_path ? '✓ Document uploaded' : 'Document not uploaded'}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '8px' }}>{error}</div>
      )}
    </div>
  )
}
