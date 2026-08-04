import { useState } from 'react'
import { timeAgo } from '../../lib/approvalEngine'

export default function ReimbursementCard({ report, selected, onToggle, readonly = false }) {
  const [expanded, setExpanded] = useState(false)

  const expenses = report.report_expenses
    ?.map(re => re.expense_details)
    .filter(Boolean) || []

  const reimbType = expenses[0]?.reimbursement_type || 'Bank transfer'

  return (
    <div style={{ border: '1px solid #E8E8E8', marginBottom: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>

        {/* Checkbox */}
        {!readonly && (
          <div
            onClick={e => { e.stopPropagation(); onToggle && onToggle(report.id) }}
            style={{
              width: '20px', height: '20px', flexShrink: 0,
              border: `1.5px solid ${selected ? '#1A1A1A' : '#E8E8E8'}`,
              background: selected ? '#1A1A1A' : '#FFFFFF',
              borderRadius: '2px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: '2px',
            }}
          >
            {selected && (
              <div style={{
                width: '10px', height: '6px',
                borderLeft: '2px solid #FFFFFF', borderBottom: '2px solid #FFFFFF',
                transform: 'rotate(-45deg)', marginTop: '-3px',
              }} />
            )}
          </div>
        )}

        {/* Content — tap to expand */}
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
              {report.brand || 'Team Member'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
              {report.total_amount ? `₹${Number(report.total_amount).toLocaleString('en-IN')}` : '—'}
            </div>
          </div>

          {/* Second row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
              {report.expense_count || 0} expense{report.expense_count !== 1 ? 's' : ''}
              {report.brand ? ` · ${report.brand}` : ''}
            </div>
            <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
              {readonly
                ? report.reimbursed_at
                  ? `Reimbursed ${new Date(report.reimbursed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : '—'
                : `Approved ${timeAgo(report.approved_at)}`
              }
            </div>
          </div>

          {/* Third row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: '#6B6B6B', fontFamily: 'monospace' }}>
              {report.report_reference}
            </div>
            {readonly ? (
              <div style={{
                fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '2px',
                background: '#F0FDF4', color: '#16A34A',
              }}>
                Reimbursed
              </div>
            ) : (
              <div style={{
                fontSize: '11px', color: '#4A4A4A',
                background: '#F7F7F7', padding: '2px 8px',
              }}>
                {reimbType}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded expense breakdown */}
      {expanded && expenses.length > 0 && (
        <div style={{ borderTop: '1px solid #E8E8E8' }}>
          {expenses.map((exp, i) => (
            <div
              key={i}
              style={{
                padding: '8px 16px',
                borderBottom: i < expenses.length - 1 ? '1px solid #E8E8E8' : 'none',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: i % 2 === 0 ? '#FFFFFF' : '#F7F7F7',
              }}
            >
              <div style={{ fontSize: '12px', color: '#4A4A4A' }}>
                {[exp.vendor, exp.category].filter(Boolean).join(' · ')}
              </div>
              <div style={{ fontSize: '12px', color: '#4A4A4A', flexShrink: 0, marginLeft: '12px' }}>
                {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
