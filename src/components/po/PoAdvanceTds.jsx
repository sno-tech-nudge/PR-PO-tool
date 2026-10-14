import { useState, useEffect, useMemo } from 'react'
import { loadTdsRules, computeTds, vendorYtdBase } from '../../lib/tds'

const money = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

// TDS on the advance part of a vendor payment. The advance is the PO amount
// times the advance %, and the same rules that apply to invoices work out the
// tax, so an advance never goes out without it being looked at. Shown to the
// Finance team only.
export default function PoAdvanceTds({ po, pr, vendor }) {
  const advancePct = Number(pr?.advance_percent) || 0
  const categories = useMemo(() => String(pr?.category || '').split(',').map(c => c.trim()).filter(Boolean), [pr])
  const [category, setCategory] = useState(categories[0] || '')
  const [rules, setRules] = useState(null)
  const [ytd, setYtd] = useState(0)
  const advance = Math.round(((Number(po?.amount) || 0) * advancePct) / 100)
  const [base, setBase] = useState(String(advance))

  useEffect(() => { loadTdsRules().then(setRules) }, [])
  useEffect(() => {
    if (!vendor) return
    vendorYtdBase({ id: po.id, vendor: vendor.org_name, vendor_id: vendor.id, date: new Date().toISOString().slice(0, 10) }).then(setYtd)
  }, [vendor, po])

  const result = useMemo(() => (rules ? computeTds({ rules, category, pan: vendor?.pan_number, base, ytdBase: ytd }) : null), [rules, category, vendor, base, ytd])
  if (!advancePct || !advance) return null

  const net = advance - (result?.status === 'applicable' ? result.amount : 0)
  return (
    <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '16px', marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '2px' }}>TDS on the advance</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        {advancePct}% of {money(po.amount)} is {money(advance)}. Change the base amount if the PO amount includes GST.
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {categories.length > 1 && (
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ height: '32px', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', fontSize: '12px', padding: '0 8px', background: 'var(--surface-card)' }}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>Base amount of the advance</div>
          <input type="number" min="0" value={base} onChange={e => setBase(e.target.value)} style={{ height: '32px', width: '150px', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: '12px' }} />
        </div>
      </div>
      {!result ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Working out TDS…</div>
      ) : (
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--ink)', background: result.status === 'applicable' ? 'var(--gold-bg)' : 'var(--taupe-50)', border: `1px solid ${result.status === 'applicable' ? 'var(--gold-border)' : 'var(--taupe-200)'}`, borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
          <strong>{result.status === 'applicable' ? `TDS ${money(result.amount)}` : result.status === 'review' ? 'Needs a look' : 'No TDS'}</strong>
          {result.section ? ` · ${result.section}` : ''}
          <div style={{ color: 'var(--text-muted)' }}>{result.note}</div>
          <div style={{ marginTop: '4px' }}>Pay the vendor <strong>{money(net)}</strong> as the advance.</div>
        </div>
      )}
    </div>
  )
}
