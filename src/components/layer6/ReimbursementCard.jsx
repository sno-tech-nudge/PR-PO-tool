import { useState } from 'react'
import { timeAgo } from '../../lib/approvalEngine'

export default function ReimbursementCard({ report, selected, onToggle, readonly = false }) {
  const [expanded, setExpanded] = useState(false)

  const expenses = report.report_expenses
    ?.map(re => re.expense_details)
    .filter(Boolean) || []

  const reimbType = expenses[0]?.reimbursement_type || 'Bank transfer'

  return (
    <div style={{ border: '1px solid var(--taupe-200)', marginBottom: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>

        {/* Checkbox */}
        {!readonly && (
          <div
            onClick={e => { e.stopPropagation(); onToggle && onToggle(report.id) }}
            style={{
              width: '20px', height: '20px', flexShrink: 0,
              border: `1.5px solid ${selected ? 'var(--text)' : 'var(--taupe-200)'}`,
              background: selected ? 'var(--text)' : 'var(--surface-card)',
              borderRadius: 'var(--radius-xs)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: '2px',
            }}
          >
            {selected && (
              <div style={{
                width: '10px', height: '6px',
                borderLeft: '2px solid var(--surface-card)', borderBottom: '2px solid var(--surface-card)',
                transform: 'rotate(-45deg)', marginTop: '-3px',
              }} />
            )}
          </div>
        )}

        {/* Content — tap to expand */}
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
              {report.brand || 'Team Member'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
              {report.total_amount ? `₹${Number(report.total_amount).toLocaleString('en-IN')}` : '—'}
            </div>
          </div>

          {/* Second row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {report.expense_count || 0} expense{report.expense_count !== 1 ? 's' : ''}
              {report.brand ? ` · ${report.brand}` : ''}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
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
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {report.report_reference}
            </div>
            {readonly ? (
              <div style={{
                fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-xs)',
                background: 'var(--moss-bg)', color: 'var(--moss)',
              }}>
                Reimbursed
              </div>
            ) : (
              <div style={{
                fontSize: '11px', color: 'var(--text-muted)',
                background: 'var(--taupe-50)', padding: '2px 8px',
              }}>
                {reimbType}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded expense breakdown */}
      {expanded && expenses.length > 0 && (
        <div style={{ borderTop: '1px solid var(--taupe-200)' }}>
          {expenses.map((exp, i) => (
            <div
              key={i}
              style={{
                padding: '8px 16px',
                borderBottom: i < expenses.length - 1 ? '1px solid var(--taupe-200)' : 'none',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)',
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {[exp.vendor, exp.category].filter(Boolean).join(' · ')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '12px' }}>
                {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
