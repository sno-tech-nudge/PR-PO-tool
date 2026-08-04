import { useState } from 'react'

export default function ExpenseApprovalCard({ expense, onFlag, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [flagNote, setFlagNote] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [removed, setRemoved] = useState(false)

  if (removed) return null

  const hasViolation = expense.policy_status === 'blocked'
  const hasFlagPrev = expense.policy_status === 'flagged'

  function handleFlagSubmit() {
    if (!flagNote.trim()) return
    onFlag && onFlag(expense.id, flagNote.trim())
    setFlagged(true)
    setFlagging(false)
  }

  async function handleRemove() {
    onRemove && await onRemove(expense.id)
    setRemoved(true)
  }

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

      {/* Second row */}
      <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '4px' }}>
        {[expense.category, expense.date, expense.brand].filter(Boolean).join(' · ')}
      </div>

      {/* Purpose / description */}
      {(expense.purpose_type || expense.description) && (
        <div style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: '1.4', marginBottom: '8px' }}>
          {expense.purpose_type && <span>{expense.purpose_type}</span>}
          {expense.purpose_type && expense.description && <span> — </span>}
          {expense.description && <span>{expense.description.length > 80 ? expense.description.slice(0, 80) + '…' : expense.description}</span>}
        </div>
      )}

      {/* Policy status */}
      {hasViolation ? (
        <div style={{ fontSize: '11px', color: '#DC2626', marginBottom: '8px' }}>Policy issue flagged</div>
      ) : hasFlagPrev ? (
        <div style={{ fontSize: '11px', color: '#CA8A04', marginBottom: '8px' }}>Flagged for review</div>
      ) : (
        <div style={{ fontSize: '11px', color: '#16A34A', marginBottom: '8px' }}>Policy passed</div>
      )}

      {/* Documents expandable */}
      {(expense.receipt_url || expense.payment_url) && (
        <>
          <div
            onClick={() => setExpanded(e => !e)}
            style={{ fontSize: '11px', color: '#6B6B6B', cursor: 'pointer', textDecoration: 'underline', marginBottom: '8px' }}
          >
            {expanded ? 'Hide documents' : 'View documents'}
          </div>
          {expanded && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              {expense.receipt_url && (
                <div>
                  <img
                    src={expense.receipt_url}
                    alt="Receipt"
                    crossOrigin="anonymous"
                    style={{ maxWidth: '120px', maxHeight: '90px', objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block' }}
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
                    style={{ maxWidth: '120px', maxHeight: '90px', objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block' }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                  <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '4px' }}>Payment proof</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Inline flag */}
      {flagging && (
        <div style={{ marginBottom: '8px' }}>
          <textarea
            value={flagNote}
            onChange={e => setFlagNote(e.target.value)}
            placeholder="Note for this expense..."
            rows={2}
            style={{
              width: '100%', border: '1px solid #E8E8E8', padding: '8px',
              fontSize: '12px', resize: 'none', fontFamily: 'system-ui, -apple-system, sans-serif',
              outline: 'none', boxSizing: 'border-box', borderRadius: 0,
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button
              onClick={handleFlagSubmit}
              style={{
                height: '32px', padding: '0 12px',
                background: '#CA8A04', color: '#FFFFFF',
                border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '2px',
              }}
            >
              Add note
            </button>
            <button
              onClick={() => setFlagging(false)}
              style={{
                height: '32px', padding: '0 12px',
                background: '#FFFFFF', color: '#4A4A4A',
                border: '1px solid #E8E8E8', fontSize: '11px', cursor: 'pointer', borderRadius: '2px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {flagged && (
        <div style={{ fontSize: '11px', color: '#CA8A04', marginBottom: '8px' }}>Note added</div>
      )}

      {/* Inline actions */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
        {!flagged && !flagging && (
          <div
            onClick={() => setFlagging(true)}
            style={{ fontSize: '11px', color: '#CA8A04', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Flag this expense
          </div>
        )}
        <div
          onClick={handleRemove}
          style={{ fontSize: '11px', color: '#DC2626', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Remove from report
        </div>
      </div>
    </div>
  )
}
