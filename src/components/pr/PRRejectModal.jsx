import { useState } from 'react'

export default function PRRejectModal({ prNumber, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    if (!reason.trim()) return
    setSaving(true)
    await onConfirm(reason.trim())
    setSaving(false)
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
        style={{ background: '#FFFFFF', borderRadius: '6px', padding: '24px', width: '100%', maxWidth: '440px' }}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F36', marginBottom: '4px' }}>
          Reject purchase request
        </div>
        {prNumber && (
          <div style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace', marginBottom: '14px' }}>{prNumber}</div>
        )}

        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain why this purchase request is being rejected…"
          rows={4}
          autoFocus
          style={{ width: '100%', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '10px 12px', fontSize: '13px', color: '#1A1F36', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            onClick={handleConfirm}
            disabled={!reason.trim() || saving}
            style={{
              height: '40px', padding: '0 24px', borderRadius: '4px', fontSize: '13px', fontWeight: 600,
              background: !reason.trim() || saving ? '#9CA3AF' : '#B91C1C', color: '#FFFFFF', border: 'none',
              cursor: !reason.trim() || saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Confirm Rejection'}
          </button>
          <button
            onClick={onCancel}
            style={{ height: '40px', padding: '0 20px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
