import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { canAccessFinance } from '../../lib/auth'
import { getDisplayName } from '../../lib/directory'

const money = n => `₹${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-IN')}`
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
// Reports whose invoices count against the advance once they are approved.
const BOOKED = ['approved', 'processing', 'reimbursed']

// An account for each employee: advances paid to them, and what reports have
// drawn from those advances (after Accounts' deductions). The balance is what
// is still left on their advances. All of it is worked out from advances and
// reports already in the system; nothing is typed.
function buildStatements(advances, uses) {
  const byEmployee = {}
  const of = email => (byEmployee[email] ||= { email, rows: [], paid: 0, booked: 0, pending: 0 })
  const owner = Object.fromEntries(advances.map(a => [a.id, a.requested_by]))
  for (const a of advances) {
    if (!a.requested_by) continue
    const acct = of(a.requested_by)
    acct.rows.push({ key: `a${a.id}`, date: a.recorded_at || a.created_at, kind: 'advance', title: 'Advance paid', sub: a.description, amount: Number(a.amount) || 0 })
    acct.paid += Number(a.amount) || 0
  }
  for (const u of uses) {
    const r = u.expense_reports
    const email = owner[u.advance_id]
    if (!r || !email || r.status === 'draft' || r.status === 'rejected') continue
    const counted = BOOKED.includes(r.status)
    const amount = Number(u.amount) || 0
    const acct = of(email)
    acct.rows.push({
      key: `r${u.id}`, date: r.approved_at || r.submitted_at || r.created_at, kind: 'invoice', counted,
      title: counted ? 'Settled from advance' : 'Held for a report awaiting approval', sub: r.report_reference,
      amount, claimed: Number(r.total_amount) || 0, net: r.net_payable != null ? Number(r.net_payable) : null,
    })
    if (counted) acct.booked += amount
    else acct.pending += amount
  }
  for (const acct of Object.values(byEmployee)) {
    acct.rows.sort((a, b) => new Date(a.date) - new Date(b.date))
    let bal = 0
    for (const row of acct.rows) {
      if (row.kind === 'advance') bal += row.amount
      else bal -= row.amount
      row.balance = bal
    }
    // What is left allows for reports still awaiting approval, so it matches what the employee sees.
    acct.balance = acct.paid - acct.booked - acct.pending
  }
  return Object.values(byEmployee)
}

function Statement({ acct }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--taupe-100)', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{getDisplayName(acct.email)}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{acct.email}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Left on the advances</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: acct.balance > 0 ? 'var(--gold-text)' : acct.balance < 0 ? 'var(--clay-text)' : 'var(--moss-text)' }}>{money(acct.balance)}</div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
          <thead>
            <tr style={{ background: 'var(--taupe-50)' }}>
              {['Date', 'Entry', 'Advance paid', 'Settled', 'Balance left'].map((h, i) => (
                <th key={h} style={{ padding: '8px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i > 1 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {acct.rows.map(r => (
              <tr key={r.key} style={{ borderTop: '1px solid var(--taupe-100)', opacity: r.kind === 'invoice' && !r.counted ? 0.6 : 1 }}>
                <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--ink)' }}>
                  <div style={{ fontWeight: 500 }}>{r.title}</div>
                  {r.sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: r.kind === 'invoice' ? 'monospace' : 'inherit' }}>{r.sub}</div>}
                  {r.kind === 'invoice' && r.net != null && r.net !== r.claimed && (
                    <div style={{ fontSize: '11px', color: 'var(--clay-text)' }}>Claimed {money(r.claimed)}, {money(r.net)} after deductions</div>
                  )}
                </td>
                <td style={{ padding: '10px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--ink)' }}>{r.kind === 'advance' ? money(r.amount) : ''}</td>
                <td style={{ padding: '10px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--ink)' }}>{r.kind === 'invoice' ? money(r.amount) : ''}</td>
                <td style={{ padding: '10px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {acct.pending > 0 && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--taupe-100)', fontSize: '11px', color: 'var(--text-muted)' }}>
          The balance includes {money(acct.pending)} held for reports still awaiting approval.
        </div>
      )}
    </div>
  )
}

export default function AdvanceLedger({ user }) {
  const isFinance = canAccessFinance(user.role)
  const [accounts, setAccounts] = useState(null)
  const [search, setSearch] = useState('')
  const [openEmail, setOpenEmail] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let aq = supabase.from('advances').select('id, requested_by, amount, description, status, recorded_at, created_at').eq('status', 'recorded')
      if (!isFinance) aq = aq.in('requested_by', user.ownEmails)
      const { data: adv } = await aq
      const { data: reps } = (adv || []).length
        ? await supabase.from('report_advances').select('id, advance_id, amount, expense_reports(report_reference, status, total_amount, net_payable, approved_at, submitted_at, created_at)').in('advance_id', adv.map(a => a.id))
        : { data: [] }
      if (cancelled) return
      const list = buildStatements(adv || [], reps || [])
      setAccounts(list)
      if (!isFinance && list[0]) setOpenEmail(list[0].email)
    }
    load()
    return () => { cancelled = true }
  }, [isFinance, user])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (accounts || [])
      .filter(a => !q || a.email.toLowerCase().includes(q) || getDisplayName(a.email).toLowerCase().includes(q))
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  }, [accounts, search])

  if (!accounts) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>

  if (!isFinance) {
    const mine = accounts[0]
    return mine
      ? <Statement acct={mine} />
      : <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>No advances have been paid to you yet.</div>
  }

  const open = accounts.find(a => a.email === openEmail)
  const withEmployees = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[['Still with employees', withEmployees, 'var(--gold-text)'], ['Settled so far', accounts.reduce((s, a) => s + a.booked, 0), 'var(--moss-text)'], ['Employees with advances', accounts.length, 'var(--ink)']].map(([label, value, color]) => (
          <div key={label} style={{ flex: '1 1 180px', background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color }}>{label === 'Employees with advances' ? value : money(value)}</div>
          </div>
        ))}
      </div>

      {open ? (
        <div>
          <div onClick={() => setOpenEmail(null)} style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '12px' }}>← All employees</div>
          <Statement acct={open} />
        </div>
      ) : (
        <>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search an employee…"
            style={{ height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: '13px', width: '280px', maxWidth: '100%', marginBottom: '12px', background: 'var(--surface-card)', outline: 'none' }}
          />
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
              <thead>
                <tr style={{ background: 'var(--taupe-50)' }}>
                  {['Employee', 'Advances paid', 'Settled', 'Left on advances'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={4} style={{ padding: '30px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>No advances have been paid yet.</td></tr>}
                {shown.map(a => (
                  <tr key={a.email} onClick={() => setOpenEmail(a.email)} style={{ borderTop: '1px solid var(--taupe-100)', cursor: 'pointer' }}>
                    <td style={{ padding: '11px 14px', fontSize: '13px', color: 'var(--action)', fontWeight: 500 }}>{getDisplayName(a.email)}</td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{money(a.paid)}</td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace' }}>{money(a.booked)}</td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: a.balance > 0 ? 'var(--gold-text)' : a.balance < 0 ? 'var(--clay-text)' : 'var(--moss-text)' }}>
                      {money(a.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
