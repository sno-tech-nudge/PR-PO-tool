import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import AdminStats from './AdminStats'
import AdminAllReports from './AdminAllReports'
import AdminReportDetail from './AdminReportDetail'
import ReimbursementBatch from './ReimbursementBatch'
import TallyExportView from './TallyExportView'


const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'reports',  label: 'All Reports' },
  { key: 'pending',  label: 'Pending Payment' },
  { key: 'history',  label: 'Payment History' },
  { key: 'tally',    label: 'Tally Export' },
]

export default function FinanceDashboard({ onBack }) {
  const [tab, setTab] = useState('overview')
  const [detailReportId, setDetailReportId] = useState(null)
  const [pendingReports, setPendingReports]   = useState([])
  const [historyReports, setHistoryReports]   = useState([])
  const [pendingLoading, setPendingLoading]   = useState(false)
  const [historyLoading, setHistoryLoading]   = useState(false)
  const [search, setSearch] = useState('')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => { loadPending(); loadHistory() }, [])

  async function loadPending() {
    setPendingLoading(true)
    const { data } = await supabase
      .from('expense_reports')
      .select(`id, report_reference, total_amount, expense_count, status, brand, approved_at,
        report_expenses (expense_details (id, vendor, category, amount, reimbursement_type))`)
      .eq('status', 'approved')
      .order('approved_at', { ascending: true })
    setPendingReports(data || [])
    setPendingCount((data || []).length)
    setPendingLoading(false)
  }

  async function loadHistory() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('expense_reports')
      .select(`id, report_reference, total_amount, expense_count, status, brand, approved_at, reimbursed_at,
        employee_email, vouched_by,
        report_approvals (approver_level, approver_name, status, actioned_at),
        report_expenses (expense_details (id, vendor, category, amount, reimbursement_type))`)
      .eq('status', 'reimbursed')
      .order('reimbursed_at', { ascending: false })
      .limit(100)
    setHistoryReports(data || [])
    setHistoryLoading(false)
  }

  function handleReimbursed(ids) {
    setPendingReports(prev => prev.filter(r => !ids.includes(r.id)))
    setPendingCount(prev => prev - ids.length)
    loadHistory()
  }

  if (detailReportId) {
    return (
      <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px' }}>
          <AdminReportDetail reportId={detailReportId} onBack={() => setDetailReportId(null)} />
        </div>
      </div>
    )
  }

  const filteredHistory = search.trim()
    ? historyReports.filter(r =>
        (r.report_reference || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.brand || '').toLowerCase().includes(search.toLowerCase()))
    : historyReports
  const pendingTotal = pendingReports.reduce((s, r) => s + (r.total_amount || 0), 0)

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>

      {/* Top header bar */}
      <div style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E3E8EF',
        padding: '0 28px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 0 0', marginBottom: '2px' }}>
            {onBack && (
              <>
                <span
                  onClick={onBack}
                  style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}
                >
                  Expenses
                </span>
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
              </>
            )}
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Finance Admin</span>
          </div>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: 0, padding: '8px 0' }}>
              Finance Dashboard
            </h1>
            {pendingCount > 0 && (
              <div
                onClick={() => setTab('pending')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#FFF7ED', border: '1px solid #FED7AA',
                  padding: '6px 14px', cursor: 'pointer', borderRadius: '4px',
                }}
              >
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#EA580C', flexShrink: 0,
                }} />
                <span style={{ fontSize: '12px', color: '#9A3412', fontWeight: 500 }}>
                  {pendingCount} report{pendingCount !== 1 ? 's' : ''} awaiting payment
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#7C2D12' }}>
                  INR {Number(pendingTotal).toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '0', marginTop: '4px' }}>
            {TABS.map(t => (
              <div
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? '#1565C0' : '#6B7280',
                  borderBottom: tab === t.key ? '2px solid #1565C0' : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  marginBottom: '-1px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {t.label}
                {t.key === 'pending' && pendingCount > 0 && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: '#DC2626', color: '#FFFFFF',
                    borderRadius: '10px', padding: '1px 6px', lineHeight: '16px',
                  }}>
                    {pendingCount}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 28px' }}>

        {tab === 'overview' && <AdminStats />}

        {tab === 'reports' && (
          <AdminAllReports onViewDetail={id => setDetailReportId(id)} />
        )}

        {tab === 'pending' && (
          pendingLoading
            ? <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
            : <ReimbursementBatch reports={pendingReports} onReimbursed={handleReimbursed} />
        )}

        {tab === 'history' && (
          <div>
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

            {historyLoading && (
              <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
            )}

            {!historyLoading && filteredHistory.length === 0 && (
              <div style={{
                background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '4px',
                padding: '48px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF',
              }}>
                No reimbursements found
              </div>
            )}

            {!historyLoading && filteredHistory.length > 0 && (
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
                    {filteredHistory.map((report, i) => (
                      <tr
                        key={report.id}
                        onClick={() => setDetailReportId(report.id)}
                        style={{ borderBottom: i < filteredHistory.length - 1 ? '1px solid #F3F4F6' : 'none', background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA', cursor: 'pointer' }}
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
                          {report.approved_at ? new Date(report.approved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: '12px', color: '#15803D', fontWeight: 500 }}>
                          {report.reimbursed_at ? new Date(report.reimbursed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 14px', borderTop: '1px solid #E3E8EF', fontSize: '11px', color: '#9CA3AF', background: '#F8F9FA' }}>
                  {filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'tally' && <TallyExportView />}
      </div>
    </div>
  )
}
