import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { loadAdvanceBalances, money } from '../../lib/advanceBalance'

// What a report did with advances, for the employee, the manager and Finance:
// the employee's answer when they had an advance open, how much each advance
// gave, and what is left on it now.
export default function AdvanceSummary({ report, compact = false }) {
  const [rows, setRows] = useState(null)
  const [tick, setTick] = useState(0)
  // Refreshes when advance figures change elsewhere on the page, e.g. Accounts saves a deduction.
  useEffect(() => {
    const bump = () => setTick(t => t + 1)
    window.addEventListener('nudge-advance-change', bump)
    return () => window.removeEventListener('nudge-advance-change', bump)
  }, [])

  useEffect(() => {
    if (!report?.id) return
    let cancelled = false
    async function load() {
      const { data: uses } = await supabase.from('report_advances').select('advance_id, amount').eq('report_id', report.id)
      const balances = await loadAdvanceBalances([report.employee_email])
      if (cancelled) return
      const byId = Object.fromEntries(balances.map(b => [b.id, b]))
      setRows({
        uses: (uses || []).map(u => ({ ...u, advance: byId[u.advance_id] })).filter(u => u.advance),
        open: balances.filter(b => b.remaining > 0),
      })
    }
    load()
    return () => { cancelled = true }
  }, [report?.id, report?.employee_email, report?.status, report?.advance_applied, tick])

  if (!rows) return null
  const choice = report.advance_choice
  const nothing = !rows.uses.length && !choice && !rows.open.length
  if (nothing) return null

  const box = { border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', background: 'var(--taupe-50)', padding: compact ? '10px 12px' : '12px 14px', marginBottom: '16px', fontSize: '12px', lineHeight: 1.6, color: 'var(--ink)' }
  return (
    <div style={box}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Advance</div>
      {choice === 'no' && (
        <div>The employee chose <strong>not</strong> to deduct this from an open advance{report.advance_choice_reason ? <>: {report.advance_choice_reason}</> : '.'}</div>
      )}
      {choice === 'deduct' && <div>The employee chose to deduct this from their advance.</div>}
      {rows.uses.map(u => (
        <div key={u.advance_id}>
          {money(u.amount)} taken from the {money(u.advance.amount)} advance{u.advance.description ? ` (${u.advance.description})` : ''}. <strong>{money(u.advance.remaining)} left.</strong>
        </div>
      ))}
      {!rows.uses.length && rows.open.length > 0 && (
        <div>Advance balance still open: {rows.open.map(a => `${money(a.remaining)} of ${money(a.amount)}`).join(', ')}.</div>
      )}
      {Number(report.advance_applied) > 0 && report.net_payable != null && (
        <div>Settled from advance {money(report.advance_applied)}. To reimburse: <strong>{money(Math.max(0, Number(report.net_payable) - Number(report.advance_applied)))}</strong>.</div>
      )}
    </div>
  )
}
