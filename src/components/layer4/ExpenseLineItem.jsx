import { useState } from 'react'

const POLICY_BADGE = {
  passed: { label: 'Passed', color: '#16A34A', bg: '#F0FDF4' },
  flagged: { label: 'Flagged', color: '#CA8A04', bg: '#FEFCE8' },
  blocked: { label: 'Issue', color: '#DC2626', bg: '#FEF2F2' },
}

function DetailRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#1A1A1A' }}>{value}</div>
    </div>
  )
}

export default function ExpenseLineItem({ expense, result }) {
  const [expanded, setExpanded] = useState(false)

  const hasViolations = result?.violations?.length > 0
  const hasFlags = result?.flags?.filter(f => !f.internalOnly).length > 0
  const status = hasViolations ? 'blocked' : hasFlags ? 'flagged' : 'passed'
  const badge = POLICY_BADGE[status]

  const description = expense.description || ''
  const shortDesc = description.length > 60 ? description.slice(0, 60) + '…' : description

  return (
    <div style={{ border: '1px solid #E8E8E8', padding: '16px', marginBottom: '8px' }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A', flex: 1, marginRight: '12px' }}>
          {expense.vendor || 'Unknown vendor'}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A', flexShrink: 0 }}>
          {expense.amount ? `₹${Number(expense.amount).toLocaleString('en-IN')}` : '—'}
        </div>
      </div>

      {/* Category + date row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
          {[expense.category, expense.date].filter(Boolean).join(' · ')}
        </div>
        <div style={{
          fontSize: '11px', fontWeight: 500,
          padding: '2px 8px', borderRadius: '2px',
          background: badge.bg, color: badge.color, flexShrink: 0,
        }}>
          {badge.label}
        </div>
      </div>

      {/* Team row */}
      {expense.attendee_count > 1 && (
        <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
          {expense.attendee_count} people
          {expense.per_person_amount ? ` · ₹${Number(expense.per_person_amount).toLocaleString('en-IN')} per person` : ''}
        </div>
      )}

      {/* Description preview */}
      {description && !expanded && (
        <div style={{ fontSize: '12px', color: '#4A4A4A', marginBottom: '8px', lineHeight: '1.4' }}>
          {shortDesc}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E8E8E8' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <DetailRow label="Amount" value={expense.amount ? `₹${Number(expense.amount).toLocaleString('en-IN')}` : null} />
            <DetailRow label="Vendor" value={expense.vendor} />
            <DetailRow label="Date" value={expense.date} />
            <DetailRow label="Category" value={expense.category} />
            <DetailRow
              label="Who it was for"
              value={expense.expense_type === 'just_me' ? 'Just me' : expense.expense_type === 'team' ? 'Team' : expense.expense_type}
            />
            {expense.attendee_count > 1 && (
              <DetailRow label="Number of people" value={String(expense.attendee_count)} />
            )}
            {expense.per_person_amount && (
              <DetailRow label="Per person" value={`₹${Number(expense.per_person_amount).toLocaleString('en-IN')}`} />
            )}
            <DetailRow label="Purpose" value={expense.purpose_type} />
            <DetailRow label="Trip" value={expense.trip_name} />
            <DetailRow
              label="Prior approval"
              value={expense.prior_approval_reference || (expense.prior_approval_taken ? 'Yes' : null)}
            />
            <DetailRow label="Brand" value={expense.brand} />
            <DetailRow label="Payment method" value={expense.payment_method} />
            <DetailRow label="Policy status" value={status.charAt(0).toUpperCase() + status.slice(1)} />
          </div>

          {description && (
            <div style={{ marginTop: '4px' }}>
              <DetailRow label="Description" value={description} />
            </div>
          )}

          {result?.flags?.filter(f => !f.internalOnly).length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Policy notes</div>
              {result.flags.filter(f => !f.internalOnly).map((f, i) => (
                <div key={i} style={{ fontSize: '11px', color: '#CA8A04', marginBottom: '2px' }}>
                  · {f.message}
                </div>
              ))}
            </div>
          )}

          {/* Document thumbnails */}
          {(expense.receipt_url || expense.payment_url) && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '8px', fontWeight: 600 }}>
                Documents
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                {expense.receipt_url && (
                  <div>
                    <img
                      src={expense.receipt_url}
                      alt="Receipt"
                      crossOrigin="anonymous"
                      style={{
                        maxWidth: '120px', maxHeight: '90px',
                        objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block',
                      }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                    <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '4px' }}>Receipt</div>
                  </div>
                )}
                {expense.payment_url && (
                  <div>
                    <img
                      src={expense.payment_url}
                      alt="Payment proof"
                      crossOrigin="anonymous"
                      style={{
                        maxWidth: '120px', maxHeight: '90px',
                        objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block',
                      }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                    <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '4px' }}>Payment proof</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toggle */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          fontSize: '11px', color: '#6B6B6B',
          textAlign: 'right', marginTop: '8px',
          cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        {expanded ? 'Hide details' : 'View details'}
      </div>
    </div>
  )
}
