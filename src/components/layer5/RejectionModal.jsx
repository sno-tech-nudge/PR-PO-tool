import { useState } from 'react'

const QUICK_REASONS = [
  'Receipt unclear',
  'Amount exceeds limit',
  'Wrong project tagged',
  'Missing information',
]

export default function RejectionModal({ onSendBack, onCancel }) {
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSendBack() {
    if (!reason.trim()) return
    setSending(true)
    await onSendBack(reason.trim())
    setSending(false)
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26, 26, 26, 0.5)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)',
          padding: '24px',
          width: '100%',
          maxWidth: '440px',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text)', marginBottom: '8px' }}>
          Return to employee
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
          Add a reason so the employee knows what to fix.
        </div>

        {/* Quick reasons */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '8px', marginBottom: '12px',
        }}>
          {QUICK_REASONS.map(r => (
            <div
              key={r}
              onClick={() => setReason(r)}
              style={{
                border: `1px solid ${reason === r ? 'var(--text)' : 'var(--taupe-200)'}`,
                padding: '8px 12px',
                fontSize: '12px', color: 'var(--text-muted)',
                cursor: 'pointer',
                background: reason === r ? 'var(--taupe-50)' : 'var(--surface-card)',
              }}
            >
              {r}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain what needs to be changed"
          rows={4}
          style={{
            width: '100%',
            border: '1px solid var(--taupe-200)',
            padding: '12px',
            fontSize: '13px',
            color: 'var(--text)',
            resize: 'vertical',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            outline: 'none',
            boxSizing: 'border-box',
            borderRadius: 0,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
          <button
            onClick={handleSendBack}
            disabled={!reason.trim() || sending}
            style={{
              width: '100%', height: '48px',
              background: !reason.trim() || sending ? 'var(--text-muted)' : 'var(--text)',
              color: 'var(--surface-card)', border: 'none',
              fontSize: '14px', fontWeight: 500,
              cursor: !reason.trim() || sending ? 'default' : 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {sending ? 'Sending…' : 'Send back'}
          </button>
          <button
            onClick={onCancel}
            style={{
              width: '100%', height: '48px',
              background: 'var(--surface-card)', color: 'var(--text)',
              border: '1px solid var(--action)',
              fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
