import { useState } from 'react'
import { payoutAmount } from '../../lib/advanceBalance'
import ReimburseModal from './ReimburseModal'

export default function ReimbursementBatch({ reports, onReimbursed, user }) {
  const [selected, setSelected] = useState(new Set())
  const [showModal, setShowModal] = useState(false)

  function toggleReport(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === reports.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(reports.map(r => r.id)))
    }
  }

  const selectedReports = reports.filter(r => selected.has(r.id))
  const totalAmount = selectedReports.reduce((s, r) => s + payoutAmount(r), 0)

  if (reports.length === 0) {
    return (
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '48px 0', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
        No approved reports pending reimbursement
      </div>
    )
  }

  return (
    <div>
      {/* Action bar */}
      <div style={{
        background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
        padding: '12px 16px', marginBottom: '12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            onClick={toggleAll}
            style={{
              width: '15px', height: '15px', border: `1.5px solid ${selected.size === reports.length ? 'var(--action)' : 'var(--taupe-400)'}`,
              borderRadius: 'var(--radius-xs)', background: selected.size === reports.length ? 'var(--action)' : 'var(--surface-card)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {selected.size === reports.length && (
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {reports.length} report{reports.length !== 1 ? 's' : ''} pending
            {selected.size > 0 && ` · ${selected.size} selected · INR ${Number(totalAmount).toLocaleString('en-IN')}`}
          </span>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setShowModal(true)}
            style={{
              height: '32px', padding: '0 16px',
              background: 'var(--moss-text)', color: 'var(--surface-card)',
              border: 'none', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Mark {selected.size} as Reimbursed
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
              <th style={{ width: '40px', padding: '10px 14px' }} />
              {['Reference', 'Entity', 'Expenses', 'Amount (INR)', 'Approved On'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: h === 'Amount (INR)' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((report, i) => {
              const isSelected = selected.has(report.id)
              return (
                <tr
                  key={report.id}
                  style={{
                    borderBottom: i < reports.length - 1 ? '1px solid var(--taupe-100)' : 'none',
                    background: isSelected ? 'var(--moss-bg)' : i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)',
                  }}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <div
                      onClick={() => toggleReport(report.id)}
                      style={{
                        width: '15px', height: '15px', border: `1.5px solid ${isSelected ? 'var(--moss-text)' : 'var(--taupe-400)'}`,
                        borderRadius: 'var(--radius-xs)', background: isSelected ? 'var(--moss-text)' : 'var(--surface-card)',
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
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: 'var(--action)', fontWeight: 500 }}>
                    {report.report_reference}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--ink)' }}>
                    {report.brand || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--ink)' }}>
                    {report.expense_count || 0}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--ink)', textAlign: 'right', fontFamily: 'monospace' }}>
                    {payoutAmount(report).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {report.approved_at ? new Date(report.approved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ReimburseModal
          reports={selectedReports}
          user={user}
          onClose={() => setShowModal(false)}
          onDone={ids => { setShowModal(false); setSelected(new Set()); if (onReimbursed) onReimbursed(ids) }}
        />
      )}
    </div>
  )
}
