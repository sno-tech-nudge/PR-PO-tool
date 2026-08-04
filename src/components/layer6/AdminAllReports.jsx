import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadCSV, reportsToRows } from '../../lib/exportUtils'

const STATUS_CONFIG = {
  submitted:    { label: 'Submitted',     color: '#B45309', bg: '#FFFBEB' },
  under_review: { label: 'Under Review',  color: '#8C3225', bg: '#fdf0ed' },
  approved:     { label: 'Approved',      color: '#15803D', bg: '#F0FDF4' },
  processing:   { label: 'Processing',    color: '#6D28D9', bg: '#F5F3FF' },
  reimbursed:   { label: 'Reimbursed',    color: '#374151', bg: '#F9FAFB' },
  rejected:     { label: 'Rejected',      color: '#B91C1C', bg: '#FEF2F2' },
}


export default function AdminAllReports({ onViewDetail }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [vouchedFilter, setVouchedFilter] = useState('all')
  const [policyFilter, setPolicyFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [exporting, setExporting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('expense_reports')
      .select(`
        id, report_reference, status, brand, total_amount, expense_count,
        approval_route, created_at, approved_at, rejected_at, reimbursed_at,
        rejection_reason, vouched_at, vouched_by, employee_email,
        report_approvals (approver_level, approver_name, status, actioned_at),
        report_expenses (
          expense_details (
            id, vendor, category, amount, date, policy_status,
            invoice_number, gstin, payment_method, description,
            expense_type, reimbursement_type
          )
        )
      `)
      .order('created_at', { ascending: false })
    setReports(data || [])
    setLoading(false)
  }

  const entityOptions   = [...new Set((reports || []).map(r => r.brand).filter(Boolean))].sort()
  const categoryOptions = [...new Set((reports || []).flatMap(r =>
    (r.report_expenses || []).map(re => re.expense_details?.category).filter(Boolean)
  ))].sort()

  function presetDateRange(preset) {
    const now = new Date()
    if (preset === 'today') {
      const d = now.toISOString().slice(0, 10)
      return { from: d, to: d }
    }
    if (preset === 'this_week') {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1)
      return { from: mon.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
    }
    if (preset === 'this_month') {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
    }
    if (preset === 'last_month') {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const t = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) }
    }
    if (preset === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3)
      return { from: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
    }
    if (preset === 'this_fy') {
      const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
      return { from: `${fyStart}-04-01`, to: now.toISOString().slice(0, 10) }
    }
    return { from: '', to: '' }
  }

  function handlePreset(preset) {
    setDatePreset(preset)
    if (preset === 'all') { setDateFrom(''); setDateTo(''); return }
    if (preset === 'custom') return
    const { from, to } = presetDateRange(preset)
    setDateFrom(from); setDateTo(to)
  }

  const filtered = reports.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (entityFilter !== 'all' && r.brand !== entityFilter) return false
    if (vouchedFilter === 'yes' && !r.vouched_at) return false
    if (vouchedFilter === 'no'  &&  r.vouched_at) return false
    if (policyFilter !== 'all') {
      const exps = (r.report_expenses || []).map(re => re.expense_details).filter(Boolean)
      const hasViolation = exps.some(e => e.policy_status === 'violation')
      const hasFlagged   = exps.some(e => e.policy_status === 'flagged')
      if (policyFilter === 'violation' && !hasViolation) return false
      if (policyFilter === 'flagged'   && !hasFlagged)   return false
      if (policyFilter === 'clean'     && (hasViolation || hasFlagged)) return false
    }
    if (categoryFilter !== 'all') {
      const exps = (r.report_expenses || []).map(re => re.expense_details).filter(Boolean)
      if (!exps.some(e => e.category === categoryFilter)) return false
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchRef    = (r.report_reference || '').toLowerCase().includes(q)
      const matchEmail  = (r.employee_email  || '').toLowerCase().includes(q)
      const matchBrand  = (r.brand           || '').toLowerCase().includes(q)
      if (!matchRef && !matchEmail && !matchBrand) return false
    }
    if (dateFrom) {
      const d = new Date(r.created_at)
      if (d < new Date(dateFrom)) return false
    }
    if (dateTo) {
      const d = new Date(r.created_at)
      const end = new Date(dateTo); end.setHours(23, 59, 59)
      if (d > end) return false
    }
    return true
  })

  const statusCounts = {}
  for (const r of reports) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id))
    )
  }

  function handleExport() {
    setExporting(true)
    const toExport = selected.size > 0
      ? filtered.filter(r => selected.has(r.id))
      : filtered
    const rows = reportsToRows(toExport)
    const date = new Date().toISOString().slice(0, 10)
    const suffix = statusFilter !== 'all' ? `-${statusFilter}` : ''
    downloadCSV(rows, `nudge-expenses${suffix}-${date}.csv`)
    setExporting(false)
  }

  const selectedTotal = filtered
    .filter(r => selected.has(r.id))
    .reduce((s, r) => s + (r.total_amount || 0), 0)

  const selectStyle = {
    height: '32px', border: '1px solid #E3E8EF', borderRadius: '3px',
    padding: '0 8px', fontSize: '12px', color: '#374151', background: '#FFFFFF',
    outline: 'none',
  }

  const activeFilterCount = [
    statusFilter !== 'all', entityFilter !== 'all', categoryFilter !== 'all',
    vouchedFilter !== 'all', policyFilter !== 'all', dateFrom || dateTo,
  ].filter(Boolean).length

  function clearFilters() {
    setStatusFilter('all'); setEntityFilter('all'); setCategoryFilter('all')
    setVouchedFilter('all'); setPolicyFilter('all')
    setDatePreset('all'); setDateFrom(''); setDateTo(''); setSearch('')
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', marginBottom: '12px' }}>

        {/* Row 1 — search + dropdowns */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #F3F4F6' }}>
          <input
            type="text"
            placeholder="Search reference, email, entity…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '220px', height: '32px', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '0 10px', fontSize: '12px', color: '#1A1F36', outline: 'none', background: '#F8F9FA' }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) =>
              statusCounts[key] > 0 ? <option key={key} value={key}>{label} ({statusCounts[key]})</option> : null
            )}
          </select>
          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={selectStyle}>
            <option value="all">All entities</option>
            {entityOptions.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}>
            <option value="all">All categories</option>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={vouchedFilter} onChange={e => setVouchedFilter(e.target.value)} style={selectStyle}>
            <option value="all">Vouched: All</option>
            <option value="yes">Vouched only</option>
            <option value="no">Not vouched</option>
          </select>
          <select value={policyFilter} onChange={e => setPolicyFilter(e.target.value)} style={selectStyle}>
            <option value="all">Policy: All</option>
            <option value="violation">Has violations</option>
            <option value="flagged">Has flags</option>
            <option value="clean">Clean only</option>
          </select>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={{ height: '32px', padding: '0 10px', background: 'none', border: '1px solid #E3E8EF', borderRadius: '3px', fontSize: '12px', color: '#6B7280', cursor: 'pointer' }}>
              Clear ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Row 2 — date range + export */}
        <div style={{ padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', background: '#FAFAFA' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' }}>Date Range</span>
          <select value={datePreset} onChange={e => handlePreset(e.target.value)} style={{ ...selectStyle, background: '#FFFFFF' }}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="this_quarter">This quarter</option>
            <option value="this_fy">This FY (Apr–Mar)</option>
            <option value="custom">Custom range…</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setDatePreset('custom') }}
            style={{ ...selectStyle, width: '140px', padding: '0 8px' }}
          />
          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setDatePreset('custom') }}
            style={{ ...selectStyle, width: '140px', padding: '0 8px' }}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
              {selected.size > 0 && ` · ${selected.size} selected · INR ${selectedTotal.toLocaleString('en-IN')}`}
            </span>
            <button
              onClick={handleExport}
              disabled={exporting || filtered.length === 0}
              style={{
                height: '32px', padding: '0 16px', borderRadius: '3px',
                background: filtered.length === 0 ? '#F3F4F6' : '#1565C0',
                color: filtered.length === 0 ? '#9CA3AF' : '#FFFFFF',
                border: 'none', fontSize: '12px', fontWeight: 600,
                cursor: exporting || filtered.length === 0 ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {exporting ? 'Exporting…' : selected.size > 0 ? `Export CSV (${selected.size})` : `Export CSV (${filtered.length})`}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '40px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>
          Loading…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '48px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>
          No reports found
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
                <th style={{ width: '40px', padding: '10px 14px' }}>
                  <div
                    onClick={toggleAll}
                    style={{
                      width: '15px', height: '15px', border: `1.5px solid ${selected.size === filtered.length ? '#1565C0' : '#D1D5DB'}`,
                      borderRadius: '2px', background: selected.size === filtered.length ? '#1565C0' : '#FFFFFF',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {selected.size === filtered.length && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </th>
                {['Reference', 'Entity', 'Expenses', 'Amount (INR)', 'Submitted By', 'Approved By', 'Vouched By', 'Date', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: '#6B7280', textAlign: h === 'Amount (INR)' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((report, i) => {
                const sc = STATUS_CONFIG[report.status] || { label: report.status, color: '#6B7280', bg: '#F9FAFB' }
                const expenses = (report.report_expenses || []).map(re => re.expense_details).filter(Boolean)
                const violationCount = expenses.filter(e => e.policy_status === 'violation').length
                const isSelected = selected.has(report.id)
                return (
                  <tr
                    key={report.id}
                    style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                      background: isSelected ? '#fdf0ed' : i % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                    }}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div
                        onClick={e => { e.stopPropagation(); toggleSelect(report.id) }}
                        style={{
                          width: '15px', height: '15px', border: `1.5px solid ${isSelected ? '#1565C0' : '#D1D5DB'}`,
                          borderRadius: '2px', background: isSelected ? '#1565C0' : '#FFFFFF',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {isSelected && (
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                            <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div
                        onClick={() => onViewDetail && onViewDetail(report.id)}
                        style={{ fontSize: '13px', fontFamily: 'monospace', color: '#8C3225', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {report.report_reference}
                      </div>
                      {report.vouched_at && (
                        <div style={{ fontSize: '10px', color: '#15803D', marginTop: '2px' }}>Vouched</div>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>
                      {report.brand || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>
                      {report.expense_count || expenses.length}
                      {violationCount > 0 && (
                        <span style={{ marginLeft: '6px', color: '#B91C1C', fontWeight: 500 }}>{violationCount} violation{violationCount !== 1 ? 's' : ''}</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: '#1A1F36', textAlign: 'right', fontFamily: 'monospace' }}>
                      {Number(report.total_amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>
                      {report.employee_email ? <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{report.employee_email}</span> : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>
                      {(() => {
                        const approvedRecord = (report.report_approvals || [])
                          .filter(a => a.status === 'approved')
                          .sort((a, b) => new Date(b.actioned_at) - new Date(a.actioned_at))[0]
                        return approvedRecord?.approver_name || '—'
                      })()}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>
                      {report.vouched_by
                        ? <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 500 }}>{report.vouched_by}</span>
                        : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {report.created_at ? new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '2px',
                        background: sc.bg, color: sc.color,
                      }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <button
                        onClick={() => onViewDetail && onViewDetail(report.id)}
                        style={{
                          fontSize: '12px', color: '#8C3225', background: 'none', border: 'none',
                          cursor: 'pointer', padding: 0, fontWeight: 500,
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', background: '#F8F9FA', borderTop: '1px solid #E3E8EF', fontSize: '11px', color: '#6B7280' }}>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </div>
        </div>
      )}
    </div>
  )
}
