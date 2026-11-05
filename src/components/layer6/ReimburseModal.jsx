import { useState } from 'react'
import { payoutAmount } from '../../lib/advanceBalance'
import { markReportsReimbursed } from '../../lib/reimburse'

const OLD_DAYS = 90

// The confirmation for marking reports as reimbursed. Shared by Pending Payments and All Reports.
export default function ReimburseModal({ reports, user, onClose, onDone }) {
  const [notify, setNotify] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const total = reports.reduce((s, r) => s + payoutAmount(r), 0)
  const old = reports.filter(r => r.approved_at && Date.now() - new Date(r.approved_at).getTime() > OLD_DAYS * 86400000).length

  async function confirm() {
    setSubmitting(true); setError(null)
    const res = await markReportsReimbursed(reports, { user, notify })
    setSubmitting(false)
    if (!res.ok) { setError(res.error); return }
    onDone(res.ids, res)
  }

  return (
    <div onClick={() => !submitting && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(54, 32, 26,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface-card)', padding: '28px 32px', borderRadius: 'var(--radius-sm)', width: '420px', maxWidth: '100%', border: '1px solid var(--taupe-200)' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>Confirm Reimbursement</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {reports.length} report{reports.length !== 1 ? 's' : ''} · INR {Number(total).toLocaleString('en-IN')} total
        </div>
        <div style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: '14px', padding: '12px', background: 'var(--taupe-50)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--taupe-200)', lineHeight: 1.5 }}>
          This marks the selected reports as reimbursed (paid). It can&apos;t be undone from here.
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--ink)', marginBottom: old > 0 ? '8px' : '20px', cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} style={{ marginTop: '2px' }} />
          <span>Tell the employees by email that they have been paid</span>
        </label>
        {old > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--gold-text)', marginBottom: '20px', lineHeight: 1.5 }}>
            {old} of these {old === 1 ? 'was' : 'were'} approved more than {OLD_DAYS} days ago. If the employees were already paid and told, untick the email box.
          </div>
        )}
        {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={submitting} style={{ height: '34px', padding: '0 16px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-200)', fontSize: '13px', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
            Cancel
          </button>
          <button onClick={confirm} disabled={submitting} style={{ height: '34px', padding: '0 20px', background: submitting ? 'var(--text-muted)' : 'var(--moss-text)', color: 'var(--surface-card)', border: 'none', fontSize: '13px', fontWeight: 600, cursor: submitting ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)' }}>
            {submitting ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
