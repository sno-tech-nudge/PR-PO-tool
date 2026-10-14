import { useState, useMemo } from 'react'
import { computeTds } from '../../lib/tds'
import { DEDUCTION_REASONS, suggestDeduction, saveDeduction, saveTds, lineNet } from '../../lib/deductions'

const money = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

const field = {
  height: '32px', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '0 8px',
  fontSize: '12px', fontFamily: 'inherit', background: 'var(--surface-card)', boxSizing: 'border-box', outline: 'none', color: 'var(--ink)',
}
const label = { fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }
const smallBtn = (primary, disabled) => ({
  height: '30px', padding: '0 12px', fontSize: '12px', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: disabled ? 'default' : 'pointer',
  border: primary ? 'none' : '1px solid var(--taupe-300)',
  background: disabled ? 'var(--taupe-200)' : primary ? 'var(--action)' : 'var(--surface-card)',
  color: primary ? 'var(--surface-card)' : 'var(--ink)',
})

// The Accounts team's own part of a line: take an amount off it (with a reason)
// and, for vendor payments, split it into base and GST so TDS works itself out.
// The employee never sees these fields, only what was deducted and why.
export default function AccountsPanel({ report, expense, policy, isVendor, tds, user, onPatch }) {
  const suggestion = useMemo(() => suggestDeduction(expense, policy), [expense, policy])

  // --- deduction -----------------------------------------------------------
  const [dAmount, setDAmount] = useState(expense.deduction_amount ? String(expense.deduction_amount) : '')
  const [dReason, setDReason] = useState(expense.deduction_reason || DEDUCTION_REASONS[0])
  const [dNote, setDNote] = useState(expense.deduction_note || '')
  const [dBusy, setDBusy] = useState(false)
  const [dMsg, setDMsg] = useState(null)

  async function applyDeduction(clear = false) {
    setDBusy(true); setDMsg(null)
    try {
      const { patch } = await saveDeduction({ report, expense, amount: clear ? 0 : dAmount, reason: dReason, note: dNote, user })
      onPatch(patch)
      if (clear) { setDAmount(''); setDNote('') }
      setDMsg(clear ? 'Deduction removed.' : 'Deduction saved. The employee has been told.')
    } catch { setDMsg('That could not be saved. Please try again.') }
    setDBusy(false)
  }

  // --- TDS (vendor payments only) -------------------------------------------
  const total = Number(expense.amount) || 0
  const [base, setBase] = useState(String(expense.base_amount ?? expense.amount ?? ''))
  const [gst, setGst] = useState(String(expense.gst_amount ?? ''))
  const [override, setOverride] = useState('')
  const [tBusy, setTBusy] = useState(false)
  const [tMsg, setTMsg] = useState(null)

  const result = useMemo(() => (isVendor && tds
    ? computeTds({ rules: tds.rules, category: expense.category, pan: tds.pan, base, ytdBase: tds.ytd })
    : null), [isVendor, tds, expense.category, base])
  const other = Math.max(0, Math.round((total - (Number(base) || 0) - (Number(gst) || 0)) * 100) / 100)

  function splitGst() {
    const b = Math.round((total / 1.18) * 100) / 100
    setBase(String(b)); setGst(String(Math.round((total - b) * 100) / 100))
  }
  async function confirmTds() {
    setTBusy(true); setTMsg(null)
    try {
      const { patch } = await saveTds({ report, expense, base, gst, result, amountOverride: override, user })
      onPatch(patch)
      setTMsg('TDS saved.')
    } catch { setTMsg('That could not be saved. Please try again.') }
    setTBusy(false)
  }

  const net = lineNet(expense, isVendor ? 'vendor' : 'reimbursement')

  return (
    <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', background: 'var(--taupe-50)', padding: '12px', marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>Accounts</div>

      {/* Deduction */}
      <div style={label}>Deduct from this line</div>
      {suggestion && !(Number(dAmount) > 0) && (
        <div style={{ fontSize: '12px', color: 'var(--gold-text)', marginBottom: '8px' }}>
          Suggested {money(suggestion.amount)}: {suggestion.note}{' '}
          <span role="button" onClick={() => { setDAmount(String(suggestion.amount)); setDReason(suggestion.reason); setDNote(suggestion.note) }} style={{ color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>Use it</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <input type="number" min="0" inputMode="decimal" value={dAmount} onChange={e => setDAmount(e.target.value)} placeholder="Amount" style={{ ...field, width: '110px' }} />
        <select value={dReason} onChange={e => setDReason(e.target.value)} style={{ ...field, flex: '1 1 170px' }}>
          {DEDUCTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="text" value={dNote} onChange={e => setDNote(e.target.value)} placeholder="Note (optional)" style={{ ...field, flex: '2 1 200px' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" disabled={dBusy || !(Number(dAmount) > 0)} onClick={() => applyDeduction(false)} style={smallBtn(true, dBusy || !(Number(dAmount) > 0))}>Apply deduction</button>
        {Number(expense.deduction_amount) > 0 && <button type="button" disabled={dBusy} onClick={() => applyDeduction(true)} style={smallBtn(false, dBusy)}>Remove</button>}
        {dMsg && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dMsg}</span>}
      </div>

      {/* TDS */}
      {isVendor && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--taupe-200)' }}>
          <div style={label}>TDS</div>
          {!tds ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Working out TDS…</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>Base amount</div>
                  <input type="number" min="0" inputMode="decimal" value={base} onChange={e => setBase(e.target.value)} style={{ ...field, width: '120px' }} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>GST</div>
                  <input type="number" min="0" inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} style={{ ...field, width: '100px' }} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>Other</div>
                  <div style={{ ...field, width: '90px', display: 'flex', alignItems: 'center', background: 'var(--taupe-100)', color: 'var(--text-muted)' }}>{money(other)}</div>
                </div>
                <button type="button" onClick={splitGst} style={smallBtn(false, false)}>Split 18% GST</button>
              </div>
              <div style={{
                fontSize: '12px', lineHeight: 1.5, borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: '8px',
                background: result.status === 'applicable' ? 'var(--gold-bg)' : 'var(--surface-card)',
                border: `1px solid ${result.status === 'applicable' ? 'var(--gold-border)' : 'var(--taupe-200)'}`,
                color: 'var(--ink)',
              }}>
                <strong>{result.status === 'applicable' ? `TDS ${money(result.amount)}` : result.status === 'review' ? 'Needs a look' : 'No TDS'}</strong>
                {result.section ? ` · ${result.section}` : ''}
                <div style={{ color: 'var(--text-muted)' }}>{result.note}</div>
                {tds.ytd > 0 && <div style={{ color: 'var(--text-muted)' }}>Already paid to this vendor this financial year: {money(tds.ytd)}.</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {result.status === 'applicable' && (
                  <input type="number" min="0" inputMode="decimal" value={override} onChange={e => setOverride(e.target.value)} placeholder={`Change amount (${money(result.amount)})`} style={{ ...field, width: '190px' }} />
                )}
                <button type="button" disabled={tBusy || result.status === 'review'} onClick={confirmTds} style={smallBtn(true, tBusy || result.status === 'review')}>
                  {result.status === 'applicable' ? 'Confirm TDS' : 'Confirm no TDS'}
                </button>
                {expense.tds_status && <span style={{ fontSize: '12px', color: 'var(--moss-text)' }}>Saved: {expense.tds_status === 'applicable' ? `${money(expense.tds_amount)} deducted` : 'no TDS'}</span>}
                {tMsg && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tMsg}</span>}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--taupe-200)', fontSize: '13px', color: 'var(--ink)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Net payable for this line</span>
        <strong>{money(net)}</strong>
      </div>
    </div>
  )
}
