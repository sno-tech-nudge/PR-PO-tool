import { useState } from 'react'
import { deleteExpense } from '../../lib/expenseDelete'

// "Delete" for one expense, with a confirmation that spells out what goes with
// it. `variant="link"` is the small red text link used in lists; `"button"` is
// the fuller one at the foot of a form.
export default function DeleteExpenseButton({ expense, user, onDeleted, variant = 'link', label = 'Delete' }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const res = await deleteExpense(expense, user)
    setBusy(false)
    if (!res.ok) { setError(res.reason); return }
    setConfirming(false)
    onDeleted?.(expense)
  }

  const trigger = variant === 'button' ? (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); setConfirming(true) }}
      style={{
        height: '40px', padding: '0 16px', background: 'var(--surface-card)', color: 'var(--clay-text)',
        border: '1px solid var(--clay-text)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  ) : (
    <span
      role="button"
      onClick={e => { e.stopPropagation(); setConfirming(true) }}
      style={{ fontSize: '11px', color: 'var(--clay-text)', textDecoration: 'underline', cursor: 'pointer' }}
    >
      {label}
    </span>
  )

  return (
    <>
      {trigger}
      {confirming && (
        <div
          onClick={e => { e.stopPropagation(); if (!busy) setConfirming(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface-card)', width: '100%', maxWidth: '400px', borderRadius: 'var(--radius-md)', padding: '22px' }}
          >
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Delete this expense?</div>
            <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '4px', fontWeight: 500 }}>
              {expense.vendor || 'Unknown vendor'}{expense.amount ? ` · ₹${Number(expense.amount).toLocaleString('en-IN')}` : ''}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
              Its receipt and all its details are removed too. This can&apos;t be undone.
            </div>
            {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '12px', lineHeight: 1.5 }}>{error}</div>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                style={{ height: '40px', padding: '0 18px', background: 'var(--surface-card)', color: 'var(--text)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                style={{ height: '40px', padding: '0 18px', background: busy ? 'var(--text-muted)' : 'var(--clay-text)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? 'Deleting…' : 'Delete expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
