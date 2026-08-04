import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_CONFIG = {
  saved:        { label: 'Saved',        color: '#374151', bg: '#F9FAFB' },
  submitted:    { label: 'Submitted',    color: '#B45309', bg: '#FFFBEB' },
  under_review: { label: 'Under Review', color: '#8C3225', bg: '#fdf0ed' },
  approved:     { label: 'Approved',     color: '#15803D', bg: '#F0FDF4' },
  rejected:     { label: 'Rejected',     color: '#B91C1C', bg: '#FEF2F2' },
  processing:   { label: 'Processing',   color: '#6D28D9', bg: '#F5F3FF' },
  reimbursed:   { label: 'Reimbursed',   color: '#15803D', bg: '#F0FDF4' },
}

function fmtDate(d) {
  if (!d) return '—'
  const ddmm = String(d).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  const dt = ddmm
    ? new Date(`${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`)
    : new Date(d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }) {
  const sc = STATUS_CONFIG[status] || { label: status, color: '#6B7280', bg: '#F9FAFB' }
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
      background: sc.bg, color: sc.color,
    }}>
      {sc.label}
    </span>
  )
}

export default function ExpenseHistoryScreen({ user, onViewReport, onBack }) {
  const [tab, setTab]           = useState('reports')
  const [expenses, setExpenses] = useState([])
  const [reports, setReports]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  useEffect(() => { loadAll() }, [user?.email])

  async function loadAll() {
    setLoading(true)

    let expsQuery = supabase
      .from('expense_details')
      .select('id, vendor, amount, date, category, status, payment_method, invoice_number, policy_status, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    let repsQuery = supabase
      .from('expense_reports')
      .select('id, report_reference, status, brand, total_amount, expense_count, created_at, approved_at, reimbursed_at, vouched_at, vouched_by, finance_notes')
      .order('created_at', { ascending: false })
      .limit(100)

    if (user?.email) {
      expsQuery = expsQuery.eq('user_email', user.email)
      repsQuery = repsQuery.eq('employee_email', user.email)
    }

    const [{ data: exps }, { data: reps }] = await Promise.all([expsQuery, repsQuery])
    setExpenses(exps || [])
    setReports(reps || [])
    setLoading(false)
  }

  const filteredExpenses = search.trim()
    ? expenses.filter(e =>
        (e.vendor || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.category || '').toLowerCase().includes(search.toLowerCase())
      )
    : expenses

  const filteredReports = search.trim()
    ? reports.filter(r =>
        (r.report_reference || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.brand || '').toLowerCase().includes(search.toLowerCase())
      )
    : reports

  const totalSpend = expenses
    .filter(e => ['submitted','under_review','approved','processing','reimbursed'].includes(e.status))
    .reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '20px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', fontSize: '13px', color: '#6B7280', cursor: 'pointer', padding: 0, flexShrink: 0 }}
        >
          Back
        </button>
        <div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Activity</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>Expense History</div>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827' }}>{expenses.length}</div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>Expenses</div>
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827' }}>{reports.length}</div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>Reports</div>
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827' }}>
              ₹{totalSpend.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>Submitted</div>
          </div>
        </div>
      )}

      {/* Needs attention: rejected reports or reports with finance notes */}
      {!loading && (() => {
        const needsAttention = reports.filter(r =>
          r.status === 'rejected' || (r.finance_notes && r.finance_notes.trim())
        )
        if (needsAttention.length === 0) return null
        return (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
              Needs Attention ({needsAttention.length})
            </div>
            <div style={{ border: '1.5px solid #FECACA', borderRadius: '10px', overflow: 'hidden' }}>
              {needsAttention.map((r, i) => (
                <div
                  key={r.id}
                  onClick={() => onViewReport && onViewReport(r.id)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: i < needsAttention.length - 1 ? '1px solid #FEE2E2' : 'none',
                    background: '#FFF5F5',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: r.finance_notes ? '6px' : 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{r.report_reference}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#FEE2E2', color: '#B91C1C' }}>
                      {r.status === 'rejected' ? 'Returned' : 'Note'}
                    </span>
                  </div>
                  {r.finance_notes && (
                    <div style={{ fontSize: '12px', color: '#7F1D1D', lineHeight: 1.4 }}>
                      {r.finance_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Search */}
      <input
        type="text"
        placeholder={tab === 'expenses' ? 'Search vendor or category…' : 'Search by reference…'}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', height: '38px', border: '1px solid #E5E7EB', borderRadius: '6px',
          padding: '0 12px', fontSize: '13px', color: '#111827', outline: 'none',
          marginBottom: '14px', boxSizing: 'border-box', background: '#FFFFFF',
        }}
      />

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        background: '#F3F4F6', borderRadius: '8px', padding: '3px',
      }}>
        {[
          { key: 'expenses', label: `Expenses (${expenses.length})` },
          { key: 'reports',  label: `Reports (${reports.length})` },
        ].map(t => (
          <div
            key={t.key}
            onClick={() => { setTab(t.key); setSearch('') }}
            style={{
              flex: 1, textAlign: 'center', padding: '8px', borderRadius: '6px',
              fontSize: '13px', fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#111827' : '#6B7280',
              background: tab === t.key ? '#FFFFFF' : 'transparent',
              cursor: 'pointer',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '20px 0' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: '60px', background: '#F3F4F6', borderRadius: '8px', marginBottom: '8px' }} />
          ))}
        </div>
      )}

      {/* Expenses tab */}
      {!loading && tab === 'expenses' && (
        <>
          {filteredExpenses.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '13px', color: '#9CA3AF' }}>
              No expenses found
            </div>
          )}
          {filteredExpenses.map(exp => (
            <div key={exp.id} style={{
              border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '8px',
              padding: '12px 14px', background: '#FFFFFF',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                  {exp.vendor || 'Unknown vendor'}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                  ₹{Number(exp.amount || 0).toLocaleString('en-IN')}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                  {exp.category} · {fmtDate(exp.date)}
                </div>
                <StatusBadge status={exp.status} />
              </div>
              {exp.policy_status && exp.policy_status !== 'pending' && exp.policy_status !== 'passed' && (
                <div style={{
                  marginTop: '6px', fontSize: '11px', fontWeight: 500,
                  color: exp.policy_status === 'violation' ? '#B91C1C' : '#B45309',
                }}>
                  Policy: {exp.policy_status}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Reports tab */}
      {!loading && tab === 'reports' && (
        <>
          {filteredReports.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '13px', color: '#9CA3AF' }}>
              No reports found
            </div>
          )}
          {filteredReports.map(report => (
            <div
              key={report.id}
              onClick={() => onViewReport && onViewReport(report.id)}
              style={{
                border: '1px solid #E5E7EB', borderRadius: '8px', marginBottom: '8px',
                padding: '12px 14px', background: '#FFFFFF', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>
                    {report.report_reference}
                  </span>
                  {report.vouched_at && (
                    <span style={{ fontSize: '10px', color: '#15803D', fontWeight: 600 }}>
                      Vouched
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                  ₹{Number(report.total_amount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: report.vouched_at ? '4px' : 0 }}>
                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                  {report.brand || ''}{report.brand ? ' · ' : ''}{report.expense_count || 0} expense{report.expense_count !== 1 ? 's' : ''} · {fmtDate(report.created_at)}
                </div>
                <StatusBadge status={report.status} />
              </div>
              {report.vouched_at && (
                <div style={{ fontSize: '11px', color: '#15803D' }}>
                  Verified by {report.vouched_by || 'Finance'} on {fmtDate(report.vouched_at)}
                </div>
              )}
              {report.finance_notes && (
                <div style={{
                  marginTop: '6px', fontSize: '11px', color: '#374151',
                  background: '#F9FAFB', borderRadius: '4px', padding: '6px 8px',
                  borderLeft: '2px solid #E5E7EB',
                }}>
                  <span style={{ color: '#6B7280' }}>Finance note: </span>{report.finance_notes}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
