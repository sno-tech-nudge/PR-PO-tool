import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { avgTAT, prApprovedAt, daysBetween } from '../../lib/tat'
import { getDisplayName } from '../../lib/directory'
import { fiscalYearStartStr } from '../../lib/formCalc'

const REFRESH_MS = 30000
const DEFAULT_PO_THRESHOLD = 50000
const STALE_PO_DAYS = 60

function fmtShort(n) {
  if (!n) return '₹0'
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)}L`
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

function SectionCard({ title, sub, action, children }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid #F3F4F6', paddingBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
          {sub && <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '3px' }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function KPICard({ label, value, sub, subColor, borderColor }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderLeft: `3px solid ${borderColor || '#1565C0'}`, borderRadius: '3px', padding: '16px 20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A1F36', lineHeight: 1, marginBottom: sub ? '6px' : 0, letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: subColor || '#9CA3AF' }}>{sub}</div>}
    </div>
  )
}

function Bar({ label, value, valueLabel, max, color }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#374151' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A1F36' }}>{valueLabel}</span>
      </div>
      <div style={{ height: '8px', background: '#F3F4F6', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${max ? (value / max) * 100 : 0}%`, background: color, borderRadius: '2px', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

function FlagTable({ title, note, rows, columns, onRowClick, emptyLabel }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '2px' }}>{title} ({rows.length})</div>
      {note && <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '8px' }}>{note}</div>}
      {rows.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#15803D', padding: '10px 0' }}>✓ {emptyLabel || 'None flagged'}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px' }}>
          <thead>
            <tr style={{ background: '#F8F9FA' }}>
              {columns.map(c => (
                <th key={c.key} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} onClick={() => onRowClick?.(row.id)} style={{ borderTop: '1px solid #F3F4F6', cursor: onRowClick ? 'pointer' : 'default' }}>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '8px 10px', fontSize: '12px', color: '#374151' }}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Finance/Admin analytics — a live snapshot (auto-refreshes every 30s,
// scoped to the current fiscal year to keep the poll cheap as history
// accumulates) of where money is committed but not yet spent, how the PR
// pipeline is trending, and how fast approvals move. The Audit Worklist
// section at the bottom is admin-only, loads once rather than polling
// (it's a periodic compliance check, not a live queue — see loadAudit),
// and is deliberately not fiscal-year-scoped. Everything above it is
// visible to the whole Finance Dashboard audience (already gated by
// canAccessFinance upstream).
export default function AnalyticsView({ user, onViewPR, onViewPO, onViewVendor }) {
  const [loading, setLoading] = useState(true)
  const [prs, setPRs] = useState([])
  const [approvedVendors, setApprovedVendors] = useState([]) // for TAT — visible to every viewer of this tab
  const [vendors, setVendors] = useState([]) // all vendors, any status — admin-only (Audit Worklist's duplicate-PAN check)
  const [pos, setPOs] = useState([])
  const [advancePRs, setAdvancePRs] = useState([]) // admin-only, unscoped by fiscal year (see loadAudit)
  const [linkedPoIds, setLinkedPoIds] = useState(new Set())
  const [poThreshold, setPoThreshold] = useState(String(DEFAULT_PO_THRESHOLD))
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditRefreshedAt, setAuditRefreshedAt] = useState(null)

  const isAdmin = user?.role === 'admin'

  // Fast-moving numbers (cash flow, live pipeline counts, TAT) poll every
  // 30s so they stay current. Scoped to the current fiscal year, not the
  // PR/vendor tables' full history — a live ops snapshot doesn't need last
  // year's closed-out requests, and without this the query only grows as
  // more years of data accumulate (including any future bulk Zoho import).
  useEffect(() => {
    let cancelled = false
    const fyStart = fiscalYearStartStr()
    async function load() {
      const [{ data: prRows }, { data: vendorRows }] = await Promise.all([
        supabase.from('purchase_requests').select('id, pr_number, amount, status, submitted_at, to_date, from_date, advance_percent, vendors(org_name), pr_approvals(status, actioned_at)').gte('submitted_at', fyStart),
        supabase.from('vendors').select('submitted_at, approved_at').eq('status', 'approved').gte('approved_at', fyStart),
      ])
      if (cancelled) return
      setPRs(prRows || [])
      setApprovedVendors(vendorRows || [])
      setLoading(false)
      setLastRefreshed(new Date())
    }
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // Audit Worklist (admin only) — these are compliance checks a human
  // reviews periodically, not a live queue, so it loads once rather than
  // polling every 30s, with a manual refresh instead. Deliberately NOT
  // fiscal-year-scoped, unlike the block above — a duplicate PAN, a stale
  // PO, or a 100%-advance PR from years ago is still worth flagging, so
  // this queries purchase_requests fresh here (filtered server-side to
  // just the advance_percent >= 100 rows) rather than reusing the
  // fiscal-year-scoped `prs` state from the fast-moving section above.
  const loadAudit = useCallback(async () => {
    if (!isAdmin) { setAuditLoading(false); return }
    setAuditLoading(true)
    const [{ data: vendorRows }, { data: poRows }, { data: reportRows }, { data: advRows }] = await Promise.all([
      supabase.from('vendors').select('id, vendor_id, org_name, pan_number, status, submitted_by'),
      supabase.from('purchase_orders').select('id, po_number, amount, approved_at, status, vendors(org_name)').in('status', ['issued', 'completed']),
      supabase.from('expense_reports').select('po_id').not('po_id', 'is', null),
      supabase.from('purchase_requests').select('id, pr_number, amount, status, vendors(org_name)').gte('advance_percent', 100).neq('status', 'rejected'),
    ])
    setVendors(vendorRows || [])
    setPOs(poRows || [])
    setAdvancePRs(advRows || [])
    setLinkedPoIds(new Set((reportRows || []).map(r => r.po_id)))
    setAuditLoading(false)
    setAuditRefreshedAt(new Date())
  }, [isAdmin])

  useEffect(() => { loadAudit() }, [loadAudit])

  if (loading) return <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading analytics…</div>

  // ── Cash Flow Forecast — PRs still in the pipeline (submitted or fully
  // approved but not yet turned into a PO), bucketed by month of the
  // requested purchase period (to_date, falling back to from_date/submitted
  // date when a PR has no date range) as an estimate of when this spend
  // gets committed.
  const pipeline = prs.filter(pr => pr.status === 'submitted' || pr.status === 'approved')
  const byMonth = new Map()
  for (const pr of pipeline) {
    const ref = pr.to_date || pr.from_date || pr.submitted_at
    if (!ref) continue
    const d = new Date(ref)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const cur = byMonth.get(key) || { total: 0, count: 0 }
    cur.total += Number(pr.amount) || 0
    cur.count += 1
    byMonth.set(key, cur)
  }
  const monthRows = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
  const maxMonth = Math.max(1, ...monthRows.map(([, v]) => v.total))
  const pipelineTotal = pipeline.reduce((s, pr) => s + (Number(pr.amount) || 0), 0)

  // ── Submitted vs Approved vs Rejected — a live pipeline snapshot.
  const submittedCount = prs.filter(pr => pr.status === 'submitted').length
  const approvedCount  = prs.filter(pr => pr.status === 'approved' || pr.status === 'po_generated').length
  const rejectedCount  = prs.filter(pr => pr.status === 'rejected').length
  const maxStatus = Math.max(1, submittedCount, approvedCount, rejectedCount)

  // ── TAT — same computation as Approval History's TAT cards.
  const approvedPRs = prs.filter(pr => pr.status === 'approved' || pr.status === 'po_generated')
  const prDurations = approvedPRs
    .map(pr => daysBetween(pr.submitted_at, prApprovedAt(pr, pr.pr_approvals)))
    .filter(d => d != null && d >= 0)
  const prTAT = prDurations.length ? Math.round((prDurations.reduce((a, b) => a + b, 0) / prDurations.length) * 10) / 10 : null
  const vendorTAT = avgTAT(approvedVendors, 'submitted_at', 'approved_at')

  // ── Audit Worklist (admin only) ──
  const threshold = Number(poThreshold) || 0
  const now = new Date()
  const stalePOs = pos.filter(po => {
    if (linkedPoIds.has(po.id)) return false
    if ((Number(po.amount) || 0) <= threshold) return false
    if (!po.approved_at) return false
    return daysBetween(po.approved_at, now.toISOString()) > STALE_PO_DAYS
  })
  const panGroups = new Map()
  for (const v of vendors) {
    if (!v.pan_number) continue
    if (!panGroups.has(v.pan_number)) panGroups.set(v.pan_number, [])
    panGroups.get(v.pan_number).push(v)
  }
  const duplicatePanVendors = [...panGroups.values()].filter(g => g.length > 1).flat()

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '14px', textAlign: 'right' }}>
        {lastRefreshed && `Live · last updated ${lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
      </div>

      {/* Cash Flow Forecast */}
      <SectionCard title="Cash Flow Forecast" sub="Submitted + approved PRs not yet turned into a PO, by expected purchase month">
        <div style={{ marginBottom: '14px' }}>
          <KPICard label="Total Pipeline" value={fmtShort(pipelineTotal)} sub={`${pipeline.length} PR${pipeline.length !== 1 ? 's' : ''} not yet POed`} borderColor="#1565C0" />
        </div>
        {monthRows.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>Nothing in the pipeline right now.</div>
        ) : monthRows.map(([key, v]) => (
          <Bar key={key} label={`${monthLabel(key)} · ${v.count} PR${v.count !== 1 ? 's' : ''}`} value={v.total} valueLabel={fmtShort(v.total)} max={maxMonth} color="#1565C0" />
        ))}
      </SectionCard>

      {/* Submitted vs Approved vs Rejected */}
      <SectionCard title="PR Pipeline — Submitted vs Approved vs Rejected" sub="Auto-refreshes every 30 seconds">
        <Bar label="Submitted (pending approval)" value={submittedCount} valueLabel={submittedCount} max={maxStatus} color="#B45309" />
        <Bar label="Approved (incl. PO issued)" value={approvedCount} valueLabel={approvedCount} max={maxStatus} color="#15803D" />
        <Bar label="Rejected" value={rejectedCount} valueLabel={rejectedCount} max={maxStatus} color="#B91C1C" />
      </SectionCard>

      {/* TAT */}
      <SectionCard title="Approval Turnaround Time">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <KPICard label="PR Approval TAT" value={prTAT == null ? '—' : `${prTAT} day${prTAT === 1 ? '' : 's'}`} sub={`${prDurations.length} approved PR${prDurations.length !== 1 ? 's' : ''} measured`} borderColor="#B45309" />
          <KPICard label="Vendor Approval TAT" value={vendorTAT == null ? '—' : `${vendorTAT} day${vendorTAT === 1 ? '' : 's'}`} sub={`${approvedVendors.length} approved vendor${approvedVendors.length !== 1 ? 's' : ''} measured`} borderColor="#6D28D9" />
        </div>
      </SectionCard>

      {/* Audit Worklist — admin only */}
      {isAdmin && (
        <SectionCard
          title="Audit Worklist"
          sub={`Open items worth a second look — not necessarily wrong, just flagged for review${auditRefreshedAt ? ` · checked ${auditRefreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: '#6B7280' }}>PO threshold ₹</span>
              <input
                type="number"
                value={poThreshold}
                onChange={e => setPoThreshold(e.target.value)}
                style={{ width: '90px', height: '26px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 8px', fontSize: '12px', outline: 'none' }}
              />
              <button
                onClick={loadAudit}
                disabled={auditLoading}
                style={{ height: '26px', padding: '0 10px', fontSize: '11px', fontWeight: 600, background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: auditLoading ? 'default' : 'pointer' }}
              >
                {auditLoading ? 'Checking…' : 'Refresh'}
              </button>
            </div>
          }
        >
          <FlagTable
            title={`Purchase Orders over ₹${threshold.toLocaleString('en-IN')} with no linked expense report after ${STALE_PO_DAYS} days`}
            rows={stalePOs}
            onRowClick={onViewPO}
            emptyLabel="No stale high-value POs"
            columns={[
              { key: 'po_number', label: 'PO Number' },
              { key: 'org_name', label: 'Vendor', render: r => r.vendors?.org_name || '—' },
              { key: 'amount', label: 'Amount', render: r => `₹${Number(r.amount || 0).toLocaleString('en-IN')}` },
              { key: 'approved_at', label: 'Approved On', render: r => fmtDate(r.approved_at) },
              { key: 'days', label: 'Days Since', render: r => Math.round(daysBetween(r.approved_at, now.toISOString())) },
            ]}
          />
          <FlagTable
            title="Purchase Requests with a 100% advance"
            note="Full payment before delivery — higher risk if the vendor doesn't deliver"
            rows={advancePRs}
            onRowClick={onViewPR}
            emptyLabel="No 100%-advance PRs open"
            columns={[
              { key: 'pr_number', label: 'PR Number' },
              { key: 'org_name', label: 'Vendor', render: r => r.vendors?.org_name || '—' },
              { key: 'amount', label: 'Amount', render: r => `₹${Number(r.amount || 0).toLocaleString('en-IN')}` },
              { key: 'status', label: 'Status' },
            ]}
          />
          <FlagTable
            title="Vendors sharing a PAN"
            note="Duplicate PAN registrations are allowed by policy, but worth a quick sanity check"
            rows={duplicatePanVendors}
            onRowClick={onViewVendor}
            emptyLabel="No duplicate PAN registrations"
            columns={[
              { key: 'org_name', label: 'Organisation' },
              { key: 'pan_number', label: 'PAN' },
              { key: 'status', label: 'Status' },
              { key: 'submitted_by', label: 'Submitted By', render: r => getDisplayName(r.submitted_by) },
            ]}
          />
        </SectionCard>
      )}
    </div>
  )
}
