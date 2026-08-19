import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { avgTAT, prApprovedAt, daysBetween } from '../../lib/tat'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function KPICard({ label, value, borderColor }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E3E8EF',
      borderLeft: `3px solid ${borderColor}`, borderRadius: '3px', padding: '16px 20px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#1A1F36', lineHeight: 1, letterSpacing: '-0.5px' }}>
        {value == null ? '—' : `${value} day${value === 1 ? '' : 's'}`}
      </div>
    </div>
  )
}

// Same hand-rolled bar style as AdminStats.jsx's "Spend by Category" chart —
// this app has no charting library, a 4px CSS track filled by % of max is
// the established convention.
function TATBar({ rows, maxVal }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px', borderBottom: '1px solid #F3F4F6', paddingBottom: '10px' }}>
        Average Turnaround Time
      </div>
      {rows.map(([label, value, color]) => (
        <div key={label} style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', color: '#374151' }}>{label}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A1F36' }}>{value == null ? 'No data' : `${value}d`}</span>
          </div>
          <div style={{ height: '4px', background: '#F3F4F6', borderRadius: '2px' }}>
            <div style={{ height: '100%', width: `${value != null && maxVal ? (value / maxVal) * 100 : 0}%`, background: color, borderRadius: '2px' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ApprovedTable({ title, columns, rows, onRowClick }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '12px 20px', background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>None yet</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F9FA' }}>
              {columns.map(c => (
                <th key={c.key} style={{ padding: '8px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => onRowClick(row.id)}
                style={{ borderBottom: i < rows.length - 1 ? '1px solid #F3F4F6' : 'none', cursor: 'pointer' }}
              >
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '10px 14px', fontSize: '12px', color: '#374151' }}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function ApprovalHistoryView({ onViewVendor, onViewPR, onViewPO }) {
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [vendors, setVendors] = useState([])
  const [prs, setPRs] = useState([])
  const [pos, setPOs] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: rep }, { data: ven }, { data: pr }, { data: po }] = await Promise.all([
      supabase
        .from('expense_reports')
        .select(`id, report_reference, total_amount, expense_count, status, brand, submitted_at, approved_at, reimbursed_at, employee_email, vouched_by, report_approvals (approver_level, approver_name, status, actioned_at)`)
        .eq('status', 'reimbursed')
        .order('reimbursed_at', { ascending: false })
        .limit(100),
      supabase
        .from('vendors')
        .select('id, vendor_id, org_name, pan_number, approved_by, approved_at, submitted_at')
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(50),
      supabase
        .from('purchase_requests')
        .select('id, pr_number, amount, status, submitted_at, vendors(org_name), pr_approvals(*)')
        .in('status', ['approved', 'po_generated'])
        .order('submitted_at', { ascending: false })
        .limit(50),
      supabase
        .from('purchase_orders')
        .select('id, po_number, amount, status, generated_at, approved_at, vendors(org_name)')
        .in('status', ['issued', 'completed'])
        .order('approved_at', { ascending: false })
        .limit(50),
    ])
    setReports(rep || [])
    setVendors(ven || [])
    setPRs(pr || [])
    setPOs(po || [])
    setLoading(false)
  }

  const filteredReports = search.trim()
    ? reports.filter(r =>
        (r.report_reference || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.brand || '').toLowerCase().includes(search.toLowerCase()))
    : reports

  // TAT — submitted-to-approved-by-finance, from real timestamps already on
  // each table. purchase_requests has no approved_at column, so its
  // "approved at" is derived from the final pr_approvals row (see tat.js).
  const reportTAT = avgTAT(reports.filter(r => r.approved_at), 'submitted_at', 'approved_at')
  const vendorTAT = avgTAT(vendors, 'submitted_at', 'approved_at')
  const prDurations = prs
    .map(pr => daysBetween(pr.submitted_at, prApprovedAt(pr, pr.pr_approvals)))
    .filter(d => d != null && d >= 0)
  const prTAT = prDurations.length ? Math.round((prDurations.reduce((a, b) => a + b, 0) / prDurations.length) * 10) / 10 : null

  const tatRows = [
    ['Expense Reports', reportTAT, '#1565C0'],
    ['Vendor Approval', vendorTAT, '#6D28D9'],
    ['PR Approval', prTAT, '#B45309'],
  ]
  const maxTAT = Math.max(1, ...tatRows.map(r => r[1] || 0))

  if (loading) return <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading…</div>

  return (
    <div>
      {/* TAT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <KPICard label="Report TAT" value={reportTAT} borderColor="#1565C0" />
        <KPICard label="Vendor Approval TAT" value={vendorTAT} borderColor="#6D28D9" />
        <KPICard label="PR Approval TAT" value={prTAT} borderColor="#B45309" />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <TATBar rows={tatRows} maxVal={maxTAT} />
      </div>

      {/* Approved history tables */}
      <ApprovedTable
        title={`Vendors Approved (${vendors.length})`}
        onRowClick={onViewVendor}
        rows={vendors}
        columns={[
          { key: 'org_name', label: 'Organisation' },
          { key: 'pan_number', label: 'PAN' },
          { key: 'approved_by', label: 'Approved By' },
          { key: 'approved_at', label: 'Approved On', render: r => fmtDate(r.approved_at) },
        ]}
      />
      <ApprovedTable
        title={`Purchase Requests Approved (${prs.length})`}
        onRowClick={onViewPR}
        rows={prs}
        columns={[
          { key: 'pr_number', label: 'PR Number' },
          { key: 'org_name', label: 'Vendor', render: r => r.vendors?.org_name || '—' },
          { key: 'amount', label: 'Amount', render: r => `₹${Number(r.amount || 0).toLocaleString('en-IN')}` },
          { key: 'submitted_at', label: 'Submitted', render: r => fmtDate(r.submitted_at) },
        ]}
      />
      <ApprovedTable
        title={`Purchase Orders Approved (${pos.length})`}
        onRowClick={onViewPO}
        rows={pos}
        columns={[
          { key: 'po_number', label: 'PO Number' },
          { key: 'org_name', label: 'Vendor', render: r => r.vendors?.org_name || '—' },
          { key: 'amount', label: 'Amount', render: r => `₹${Number(r.amount || 0).toLocaleString('en-IN')}` },
          { key: 'approved_at', label: 'Approved On', render: r => fmtDate(r.approved_at || r.generated_at) },
        ]}
      />

      {/* Reimbursed reports — moved from the former "Payment History" tab */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E3E8EF',
        borderRadius: '4px', padding: '16px 20px', marginBottom: '16px',
        display: 'flex', gap: '10px', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by reference or entity"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, height: '34px', border: '1px solid #E3E8EF', borderRadius: '3px',
            padding: '0 12px', fontSize: '13px', color: '#1A1F36', outline: 'none',
            background: '#F8F9FA',
          }}
        />
      </div>

      {filteredReports.length === 0 ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '4px',
          padding: '48px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF',
        }}>
          No reimbursements found
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
                {['Reference', 'Entity', 'Expenses', 'Amount (INR)', 'Submitted By', 'Approved By', 'Vouched By', 'Approved On', 'Reimbursed On'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: h === 'Amount (INR)' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report, i) => (
                <tr
                  key={report.id}
                  style={{ borderBottom: i < filteredReports.length - 1 ? '1px solid #F3F4F6' : 'none', background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}
                >
                  <td style={{ padding: '11px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#8C3225', fontWeight: 500 }}>{report.report_reference}</td>
                  <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>{report.brand || '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>{report.expense_count || 0}</td>
                  <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 700, color: '#1A1F36', textAlign: 'right', fontFamily: 'monospace' }}>
                    {Number(report.total_amount || 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}>
                    {report.employee_email || '—'}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>
                    {(() => {
                      const a = (report.report_approvals || [])
                        .filter(a => a.status === 'approved')
                        .sort((a, b) => new Date(b.actioned_at) - new Date(a.actioned_at))[0]
                      return a?.approver_name || '—'
                    })()}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: '12px', color: report.vouched_by ? '#15803D' : '#9CA3AF', fontWeight: report.vouched_by ? 500 : 400 }}>
                    {report.vouched_by || '—'}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: '12px', color: '#6B7280' }}>
                    {fmtDate(report.approved_at)}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: '12px', color: '#15803D', fontWeight: 500 }}>
                    {fmtDate(report.reimbursed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 14px', borderTop: '1px solid #E3E8EF', fontSize: '11px', color: '#9CA3AF', background: '#F8F9FA' }}>
            {filteredReports.length} record{filteredReports.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
