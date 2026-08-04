import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ReimbursementBatch({ reports, onReimbursed }) {
  const [selected, setSelected] = useState(new Set())
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

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
  const totalAmount = selectedReports.reduce((s, r) => s + (r.total_amount || 0), 0)

  async function handleConfirmReimburse() {
    setSubmitting(true)
    setError(null)
    const now = new Date().toISOString()
    const today = new Date().toISOString().slice(0, 10)

    const ids = Array.from(selected)
    const { error: err } = await supabase
      .from('expense_reports')
      .update({
        status: 'reimbursed',
        reimbursed_at: now,
        processing_date: today,
      })
      .in('id', ids)

    if (err) {
      setError('Could not mark as reimbursed. Please try again.')
      setSubmitting(false)
      return
    }

    setShowModal(false)
    setSubmitting(false)
    setSelected(new Set())
    if (onReimbursed) onReimbursed(ids)
  }

  if (reports.length === 0) {
    return (
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', padding: '48px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>
        No approved reports pending reimbursement
      </div>
    )
  }

  return (
    <div>
      {/* Action bar */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px',
        padding: '12px 16px', marginBottom: '12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            onClick={toggleAll}
            style={{
              width: '15px', height: '15px', border: `1.5px solid ${selected.size === reports.length ? '#1565C0' : '#D1D5DB'}`,
              borderRadius: '2px', background: selected.size === reports.length ? '#1565C0' : '#FFFFFF',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {selected.size === reports.length && (
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>
            {reports.length} report{reports.length !== 1 ? 's' : ''} pending
            {selected.size > 0 && ` · ${selected.size} selected · INR ${Number(totalAmount).toLocaleString('en-IN')}`}
          </span>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setShowModal(true)}
            style={{
              height: '32px', padding: '0 16px',
              background: '#15803D', color: '#FFFFFF',
              border: 'none', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', borderRadius: '3px',
            }}
          >
            Mark {selected.size} as Reimbursed
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
              <th style={{ width: '40px', padding: '10px 14px' }} />
              {['Reference', 'Entity', 'Expenses', 'Amount (INR)', 'Approved On'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: '#6B7280', textAlign: h === 'Amount (INR)' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                    borderBottom: i < reports.length - 1 ? '1px solid #F3F4F6' : 'none',
                    background: isSelected ? '#F0FDF4' : i % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                  }}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <div
                      onClick={() => toggleReport(report.id)}
                      style={{
                        width: '15px', height: '15px', border: `1.5px solid ${isSelected ? '#15803D' : '#D1D5DB'}`,
                        borderRadius: '2px', background: isSelected ? '#15803D' : '#FFFFFF',
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
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#8C3225', fontWeight: 500 }}>
                    {report.report_reference}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '12px', color: '#374151' }}>
                    {report.brand || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '12px', color: '#374151' }}>
                    {report.expense_count || 0}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700, color: '#1A1F36', textAlign: 'right', fontFamily: 'monospace' }}>
                    {Number(report.total_amount || 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6B7280' }}>
                    {report.approved_at ? new Date(report.approved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Confirmation modal */}
      {showModal && (
        <div
          onClick={() => !submitting && setShowModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#FFFFFF', padding: '28px 32px', borderRadius: '4px', width: '400px', border: '1px solid #E3E8EF' }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1F36', marginBottom: '6px' }}>
              Confirm Reimbursement
            </div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '16px' }}>
              {selected.size} report{selected.size !== 1 ? 's' : ''} · INR {Number(totalAmount).toLocaleString('en-IN')} total
            </div>
            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '24px', padding: '12px', background: '#F8F9FA', borderRadius: '3px', border: '1px solid #E3E8EF' }}>
              This will mark the selected reports as reimbursed and notify the employees.
            </div>
            {error && <div style={{ fontSize: '12px', color: '#B91C1C', marginBottom: '12px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={submitting}
                style={{ height: '34px', padding: '0 16px', background: '#FFFFFF', color: '#374151', border: '1px solid #E3E8EF', fontSize: '13px', cursor: 'pointer', borderRadius: '3px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReimburse}
                disabled={submitting}
                style={{ height: '34px', padding: '0 20px', background: submitting ? '#9CA3AF' : '#15803D', color: '#FFFFFF', border: 'none', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'default' : 'pointer', borderRadius: '3px' }}
              >
                {submitting ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
