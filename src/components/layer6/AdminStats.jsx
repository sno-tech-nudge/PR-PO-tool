import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const CAT_COLORS = {
  'Travel':                  'var(--action)',
  'Accommodation':           'var(--gold-text)',
  'Meals':                   'var(--gold-text)',
  'Learning and Development':'#0D7943',
  'Printing and Stationery': 'var(--ink)',
  'Rent Expense':            'var(--clay-text)',
  'Subgranting':             '#BE185D',
  'Client Entertainment':    '#C2410C',
  'Field Visit':             '#0E7490',
  'Office Supplies':         '#4D7C0F',
  'Other':                   'var(--text-muted)',
}

function getColor(cat) {
  return CAT_COLORS[cat] || 'var(--text-muted)'
}

function fmtINR(n) {
  if (!n) return '0'
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function fmtShort(n) {
  if (!n) return '₹0'
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)}L`
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

function KPICard({ label, value, sub, subColor, borderColor }) {
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--taupe-200)',
      borderLeft: `3px solid ${borderColor || 'var(--action)'}`,
      borderRadius: 'var(--radius-sm)',
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginBottom: '6px', letterSpacing: '-0.5px' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '11px', color: subColor || 'var(--text-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default function AdminStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: reports, error } = await supabase
      .from('expense_reports')
      .select(`id, status, total_amount, brand, created_at,
        report_expenses (expense_details (category, amount, policy_status))`)

    if (!reports || error) { setLoading(false); return }

    const byStatus   = {}
    const byCategory = {}
    const byEntity   = {}
    let thisMonthTotal = 0, lastMonthTotal = 0
    let policyViolations = 0, policyFlags = 0
    let pendingPayTotal = 0, reimbursedTotal = 0

    const now       = new Date()
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastEnd   = thisStart

    for (const r of reports) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
      if (r.status === 'approved')    pendingPayTotal  += r.total_amount || 0
      if (r.status === 'reimbursed')  reimbursedTotal  += r.total_amount || 0
      if (r.brand) byEntity[r.brand] = (byEntity[r.brand] || 0) + (r.total_amount || 0)

      const d = new Date(r.created_at)
      if (d >= thisStart)                     thisMonthTotal += r.total_amount || 0
      else if (d >= lastStart && d < lastEnd) lastMonthTotal += r.total_amount || 0

      for (const re of r.report_expenses || []) {
        const exp = re.expense_details
        if (!exp) continue
        const cat = exp.category || 'Other'
        byCategory[cat] = (byCategory[cat] || 0) + (exp.amount || 0)
        if (exp.policy_status === 'violation') policyViolations++
        else if (exp.policy_status === 'flagged') policyFlags++
      }
    }

    setStats({
      byStatus, byCategory, byEntity,
      thisMonthTotal, lastMonthTotal,
      policyViolations, policyFlags,
      pendingPayTotal, reimbursedTotal,
      total: reports.length,
    })
    setLoading(false)
  }

  if (loading) return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {[1,2,3,4].map(i => <div key={i} style={{ height: '88px', background: 'var(--taupe-200)', borderRadius: 'var(--radius-sm)' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ height: '240px', background: 'var(--taupe-200)', borderRadius: 'var(--radius-sm)' }} />
        <div style={{ height: '240px', background: 'var(--taupe-200)', borderRadius: 'var(--radius-sm)' }} />
      </div>
    </div>
  )

  if (!stats) return null

  const mom   = stats.lastMonthTotal > 0
    ? ((stats.thisMonthTotal - stats.lastMonthTotal) / stats.lastMonthTotal * 100).toFixed(1)
    : null
  const momUp = mom !== null && Number(mom) >= 0

  const pendingReview = (stats.byStatus['submitted'] || 0) + (stats.byStatus['under_review'] || 0)
  const topCats = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxCat  = topCats[0]?.[1] || 1
  const topEntities = Object.entries(stats.byEntity).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <KPICard
          label="Pending Payment"
          value={fmtShort(stats.pendingPayTotal)}
          sub={`${stats.byStatus['approved'] || 0} approved report${(stats.byStatus['approved'] || 0) !== 1 ? 's' : ''}`}
          borderColor="var(--clay)"
        />
        <KPICard
          label="Spend This Month"
          value={fmtShort(stats.thisMonthTotal)}
          sub={mom !== null ? `${momUp ? '+' : ''}${mom}% vs last month` : 'no prior month data'}
          subColor={mom !== null ? (momUp ? 'var(--clay-text)' : 'var(--moss-text)') : 'var(--text-muted)'}
          borderColor="var(--action)"
        />
        <KPICard
          label="Total Reimbursed"
          value={fmtShort(stats.reimbursedTotal)}
          sub={`${stats.byStatus['reimbursed'] || 0} report${(stats.byStatus['reimbursed'] || 0) !== 1 ? 's' : ''}`}
          borderColor="var(--moss-text)"
        />
        <KPICard
          label="Policy Violations"
          value={stats.policyViolations}
          sub={stats.policyFlags > 0 ? `${stats.policyFlags} flagged` : 'no flags'}
          subColor={stats.policyViolations > 0 ? 'var(--clay-text)' : 'var(--moss-text)'}
          borderColor={stats.policyViolations > 0 ? 'var(--clay-text)' : 'var(--moss-text)'}
        />
        <KPICard
          label="Awaiting Review"
          value={pendingReview}
          sub={`${stats.total} total reports`}
          borderColor="var(--gold-text)"
        />
      </div>

      {/* Two column charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>

        {/* Spend by category */}
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px', borderBottom: '1px solid var(--taupe-100)', paddingBottom: '10px' }}>
            Spend by Category
          </div>
          {topCats.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>No data</div>
          ) : topCats.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--ink)', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cat}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                  ₹{fmtINR(amt)}
                </span>
              </div>
              <div style={{ height: '4px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-xs)' }}>
                <div style={{ height: '100%', width: `${(amt / maxCat) * 100}%`, background: getColor(cat), borderRadius: 'var(--radius-xs)' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Report status + entity breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Status table */}
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px', borderBottom: '1px solid var(--taupe-100)', paddingBottom: '10px' }}>
              Report Pipeline
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  { key: 'submitted',    label: 'Submitted',    color: 'var(--gold-text)' },
                  { key: 'under_review', label: 'Under Review', color: 'var(--action)' },
                  { key: 'approved',     label: 'Approved',     color: 'var(--moss-text)' },
                  { key: 'rejected',     label: 'Rejected',     color: 'var(--clay-text)' },
                  { key: 'processing',   label: 'Processing',   color: 'var(--gold-text)' },
                  { key: 'reimbursed',   label: 'Reimbursed',   color: 'var(--ink)' },
                ].map(s => (
                  <tr key={s.key} style={{ borderBottom: '1px solid var(--taupe-50)' }}>
                    <td style={{ padding: '7px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: 'var(--ink)' }}>{s.label}</span>
                    </td>
                    <td style={{ padding: '7px 0', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                      {stats.byStatus[s.key] || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Monthly comparison */}
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px', borderBottom: '1px solid var(--taupe-100)', paddingBottom: '10px' }}>
              Monthly Comparison
            </div>
            <div style={{ display: 'flex', gap: '0' }}>
              <div style={{ flex: 1, paddingRight: '16px', borderRight: '1px solid var(--taupe-100)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This month</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>₹{fmtINR(stats.thisMonthTotal)}</div>
                {mom !== null && (
                  <div style={{ fontSize: '11px', color: momUp ? 'var(--clay-text)' : 'var(--moss-text)', marginTop: '4px', fontWeight: 500 }}>
                    {momUp ? '+' : ''}{mom}%
                  </div>
                )}
              </div>
              <div style={{ flex: 1, paddingLeft: '16px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last month</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-muted)' }}>₹{fmtINR(stats.lastMonthTotal)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Entity breakdown table */}
      {topEntities.length > 0 && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Spend by Entity
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                <th style={{ padding: '8px 20px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entity</th>
                <th style={{ padding: '8px 20px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Spend (INR)</th>
                <th style={{ padding: '8px 20px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {topEntities.map(([entity, amt], i) => {
                const totalAll = topEntities.reduce((s, [, a]) => s + a, 0)
                const pct = totalAll > 0 ? ((amt / totalAll) * 100).toFixed(1) : '0'
                return (
                  <tr key={entity} style={{ borderBottom: i < topEntities.length - 1 ? '1px solid var(--taupe-100)' : 'none', background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)' }}>
                    <td style={{ padding: '10px 20px', fontSize: '13px', color: 'var(--ink)' }}>{entity}</td>
                    <td style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', textAlign: 'right', fontFamily: 'monospace' }}>
                      {fmtINR(amt)}
                    </td>
                    <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pct}%</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
        {stats.total} total report{stats.total !== 1 ? 's' : ''} · all time
      </div>
    </div>
  )
}
