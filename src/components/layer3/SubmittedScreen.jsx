export default function SubmittedScreen({ submission, onAddAnother }) {
  const { reference, approvalRoute, expenseCount, total } = submission || {}

  return (
    <div style={{
      maxWidth: '480px', margin: '0 auto', padding: '40px 20px 24px',
      width: '100%', display: 'flex', flexDirection: 'column', minHeight: '100vh',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--moss-bg)', border: '2px solid #86EFAC',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '26px',
          }}>✓</div>
          <div style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
            Report submitted
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Your expense report has been sent for approval.
          </div>
        </div>

        <div style={{
          border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)',
          overflow: 'hidden', marginBottom: '24px',
        }}>
          <div style={{
            padding: '16px', borderBottom: '1px solid var(--taupe-200)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reference</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
              {reference || '—'}
            </div>
          </div>
          <div style={{
            padding: '16px', borderBottom: '1px solid var(--taupe-200)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              {total ? `₹${Number(total).toLocaleString('en-IN')}` : '—'}
            </div>
          </div>
          <div style={{
            padding: '16px', borderBottom: '1px solid var(--taupe-200)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expenses</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              {expenseCount || 0}
            </div>
          </div>
          <div style={{
            padding: '16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Approvers</div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', textAlign: 'right', maxWidth: '200px' }}>
              {approvalRoute?.label || '—'}
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--taupe-50)', borderRadius: 'var(--radius-lg)',
          padding: '14px 16px', marginBottom: '24px',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Your approver will be notified by email. You will receive a confirmation once the report is approved and forwarded to Finance for reimbursement.
          </div>
        </div>
      </div>

      <button
        onClick={onAddAnother}
        style={{
          width: '100%', height: '48px', background: 'var(--surface-card)', color: 'var(--text)',
          border: '1px solid var(--action)', fontSize: '14px', fontWeight: 500,
          cursor: 'pointer', borderRadius: 'var(--radius-sm)',
        }}
      >
        Submit another expense
      </button>
    </div>
  )
}
