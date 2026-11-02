import { useState, useMemo } from 'react'
import { computeTdsSplit } from '../../lib/tds'
import { deriveSplit, lineLabel } from '../../lib/paymentSplit'
import OtherSpecify from '../shared/OtherSpecify'
import { useCategories } from '../../lib/categories'
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
            <TdsEditor report={report} expense={expense} tds={tds} user={user} onPatch={onPatch} />
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

const round2 = n => Math.round(n * 100) / 100

// The invoice split for a vendor line: line items (each taxed by its own
// category), GST, and incidentals as whatever is left of the invoice total.
// Only the line items carry TDS. Starts from what Accounts saved, else the
// purchase request's items scaled to this invoice, else one line.
function TdsEditor({ report, expense, tds, user, onPatch }) {
  const { expense: expenseCategories } = useCategories()
  const total = Number(expense.amount) || 0
  const [init] = useState(() => deriveSplit(expense, tds.pr))
  const [lines, setLines] = useState(() => init.lines.map(l => ({ category: l.category, other: l.other || '', amount: l.amount ? String(l.amount) : '' })))
  const [gst, setGst] = useState(init.gst ? String(init.gst) : '')
  const [override, setOverride] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const result = useMemo(() => computeTdsSplit({ rules: tds.rules, lines, pan: tds.pan, pieces: tds.pieces }), [tds, lines])
  const baseSum = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0))
  const gstNum = Number(gst) || 0
  const incidental = Math.max(0, round2(total - baseSum - gstNum))
  const tooMuch = baseSum + gstNum > total + 0.5

  const setLine = (i, patch) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines(ls => [...ls, { category: '', amount: '' }])
  const removeLine = i => setLines(ls => ls.filter((_, k) => k !== i))
  function splitGst() {
    const newBase = round2(total / 1.18)
    const factor = baseSum > 0 ? newBase / baseSum : 1
    setLines(ls => {
      const scaled = ls.map(l => ({ ...l, amount: String(round2((Number(l.amount) || 0) * factor)) }))
      const drift = round2(newBase - scaled.reduce((s, l) => s + (Number(l.amount) || 0), 0))
      if (scaled.length && drift) scaled[scaled.length - 1].amount = String(round2((Number(scaled[scaled.length - 1].amount) || 0) + drift))
      return scaled
    })
    setGst(String(round2(total - newBase)))
  }
  async function confirmTds() {
    setBusy(true); setMsg(null)
    try {
      const { patch } = await saveTds({ report, expense, base: baseSum, gst, result, amountOverride: override, user })
      onPatch(patch)
      setMsg('TDS saved.')
    } catch { setMsg('That could not be saved. Please try again.') }
    setBusy(false)
  }

  const cell = { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }
  return (
    <>
      <div style={cell}>Line items, each taxed by its own category. GST and incidentals are never taxed.</div>
      {init.hint && <div style={{ fontSize: '11px', color: 'var(--gold-text)', marginBottom: '6px' }}>{init.hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
        {lines.map((l, i) => (
          <div key={i}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select value={l.category} onChange={e => setLine(i, { category: e.target.value })} style={{ ...field, flex: '1 1 180px', minWidth: 0, color: l.category ? 'var(--ink)' : 'var(--text-muted)' }} aria-label={`Category of line ${i + 1}`}>
              <option value="">Select category…</option>
              {l.category && !expenseCategories.includes(l.category) && <option value={l.category}>{l.category}</option>}
              {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" min="0" inputMode="decimal" value={l.amount} onChange={e => setLine(i, { amount: e.target.value })} placeholder="Amount" style={{ ...field, width: '110px' }} aria-label={`Amount of line ${i + 1}`} />
            {lines.length > 1 && (
              <button type="button" onClick={() => removeLine(i)} title="Remove this line" style={{ ...smallBtn(false, false), width: '30px', padding: 0 }}>×</button>
            )}
          </div>
          <OtherSpecify category={l.category} value={l.other} onChange={v => setLine(i, { other: v })} required={false} label="What is Other?" style={{ marginTop: '4px' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '8px' }}>
        <button type="button" onClick={addLine} style={smallBtn(false, false)}>+ Add line</button>
        <div>
          <div style={cell}>GST</div>
          <input type="number" min="0" inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} style={{ ...field, width: '100px' }} aria-label="GST" />
        </div>
        <div>
          <div style={cell}>Incidentals</div>
          <div style={{ ...field, width: '90px', display: 'flex', alignItems: 'center', background: 'var(--taupe-100)', color: 'var(--text-muted)' }}>{money(incidental)}</div>
        </div>
        <button type="button" onClick={splitGst} style={smallBtn(false, false)}>Split 18% GST</button>
      </div>
      <div style={{ fontSize: '12px', color: tooMuch ? 'var(--clay-text)' : 'var(--text-muted)', marginBottom: '8px' }}>
        {money(baseSum)} line items + {money(incidental)} incidentals + {money(gstNum)} GST = {money(baseSum + incidental + gstNum)} of the {money(total)} invoice.
        {tooMuch && ' The lines and GST add up to more than the invoice.'}
      </div>

      <div style={{
        fontSize: '12px', lineHeight: 1.5, borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: '8px',
        background: result.status === 'applicable' ? 'var(--gold-bg)' : 'var(--surface-card)',
        border: `1px solid ${result.status === 'applicable' ? 'var(--gold-border)' : 'var(--taupe-200)'}`,
        color: 'var(--ink)',
      }}>
        <strong>{result.status === 'applicable' ? `TDS ${money(result.amount)}` : result.status === 'review' ? 'Needs a look' : 'No TDS'}</strong>
        {result.section ? ` · ${result.section}` : ''}
        {result.lines.length > 1 && (
          <div style={{ margin: '4px 0' }}>
            {result.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span>{lineLabel(l)} {money(l.amount)}</span>
                <span style={{ color: l.tds > 0 ? 'var(--ink)' : 'var(--text-muted)' }}>{l.tds > 0 ? `${l.section} at ${l.rate}%: ${money(l.tds)}` : 'no TDS'}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ color: 'var(--text-muted)' }}>{result.note}</div>
        {tds.ytd > 0 && <div style={{ color: 'var(--text-muted)' }}>Already paid to this vendor this financial year: {money(tds.ytd)}.</div>}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {result.status === 'applicable' && (
          <input type="number" min="0" inputMode="decimal" value={override} onChange={e => setOverride(e.target.value)} placeholder={`Change amount (${money(result.amount)})`} style={{ ...field, width: '190px' }} />
        )}
        <button type="button" disabled={busy || result.status === 'review' || tooMuch} onClick={confirmTds} style={smallBtn(true, busy || result.status === 'review' || tooMuch)}>
          {result.status === 'applicable' ? 'Confirm TDS' : 'Confirm no TDS'}
        </button>
        {expense.tds_status && <span style={{ fontSize: '12px', color: 'var(--moss-text)' }}>Saved: {expense.tds_status === 'applicable' ? `${money(expense.tds_amount)} deducted` : 'no TDS'}</span>}
        {msg && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{msg}</span>}
      </div>
    </>
  )
}
