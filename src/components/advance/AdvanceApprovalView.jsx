import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { sendAdvanceEmail } from '../../lib/advanceEmail'
import { getDisplayName } from '../../lib/directory'
import VoiceInputButton from '../shared/VoiceInputButton'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ label, value }) {
  return (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--taupe-100)', display: 'flex' }}>
      <div style={{ width: '180px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, paddingTop: '1px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--ink)', flex: 1 }}>{value || '—'}</div>
    </div>
  )
}

// Single-level approval — the max advance amount (₹20,000) never reaches the
// existing report-approval fallback's >50k second tier, so there's only one
// decision to make here, unlike PRDetail/VendorApprovalView's multi-step
// chains.
export default function AdvanceApprovalView({ advance, user, onBack, onActioned }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleApprove() {
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('advances').update({
      status: 'approved', approved_by: user.email, approved_at: new Date().toISOString(),
      rejection_reason: null, rejected_by: null, rejected_at: null,
    }).eq('id', advance.id)
    if (err) { setError(err.message); setSaving(false); return }
    sendAdvanceEmail({ type: 'approved', recipientEmail: advance.requested_by, amount: advance.amount, actorName: user.name || user.email })
    onActioned('approved')
  }

  async function handleReject() {
    if (!reason.trim()) { setError('Please enter a rejection reason.'); return }
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('advances').update({
      status: 'rejected', rejection_reason: reason.trim(),
      rejected_by: user.email, rejected_at: new Date().toISOString(),
      approved_by: null, approved_at: null,
    }).eq('id', advance.id)
    if (err) { setError(err.message); setSaving(false); return }
    sendAdvanceEmail({ type: 'rejected', recipientEmail: advance.requested_by, amount: advance.amount, actorName: user.name || user.email, reason: reason.trim() })
    onActioned('rejected')
  }

  if (!advance) return null

  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
          <span onClick={onBack} style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer' }}>Advance Approvals</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Review</span>
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>₹{Number(advance.amount).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Requested by {getDisplayName(advance.requested_by)}</div>
          </div>
          <Row label="Description" value={advance.description} />
          <Row label="Expected Usage Date" value={fmtDate(advance.expected_usage_date)} />
          <Row label="Entity" value={advance.entity} />
          <Row label="Program" value={advance.program} />
          <Row label="Stream" value={advance.stream} />
          <Row label="Type of Advance" value={advance.advance_type} />
          {advance.is_multi_individual && <Row label="Raised for" value={`${advance.num_people} individuals`} />}
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Decision</span>
          </div>
          <div style={{ padding: '20px' }}>
            {error && (
              <div style={{ background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: 'var(--clay-text)' }}>
                {error}
              </div>
            )}

            {!rejecting ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleApprove}
                  disabled={saving}
                  style={{ height: '38px', padding: '0 24px', background: saving ? 'var(--text-muted)' : 'var(--moss-text)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
                >
                  {saving ? 'Saving…' : 'Approve Advance'}
                </button>
                <button
                  onClick={() => setRejecting(true)}
                  disabled={saving}
                  style={{ height: '38px', padding: '0 24px', background: 'var(--surface-card)', color: 'var(--clay-text)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>Reason for rejection</div>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', paddingRight: '40px',
                      fontSize: '13px', color: 'var(--ink)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                    }}
                  />
                  <VoiceInputButton value={reason} onChange={setReason} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleReject}
                    disabled={saving}
                    style={{ height: '38px', padding: '0 24px', background: saving ? 'var(--text-muted)' : 'var(--clay-text)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
                  >
                    {saving ? 'Saving…' : 'Confirm Rejection'}
                  </button>
                  <button
                    onClick={() => { setRejecting(false); setReason('') }}
                    style={{ height: '38px', padding: '0 18px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
