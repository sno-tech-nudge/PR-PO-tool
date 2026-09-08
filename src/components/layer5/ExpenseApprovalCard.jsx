import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const WHO_LABELS = { just_me: 'Just me', my_team: 'Multiple people' }

function DetailRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#1A1A1A' }}>{value}</div>
    </div>
  )
}

// Primary receipt/payment-proof document, linked via expense_captures —
// storage paths only, so a signed URL is fetched on demand rather than up
// front for every expense in the report.
function ReceiptDocuments({ captureId }) {
  const [urls, setUrls] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (urls || loading) return
    setLoading(true)
    const { data } = await supabase.from('expense_captures').select('receipt_storage_path, payment_storage_path').eq('id', captureId).single()
    if (!data) { setLoading(false); return }
    const links = {}
    if (data.receipt_storage_path) {
      const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(data.receipt_storage_path, 3600)
      if (s?.signedUrl) links.receipt = s.signedUrl
    }
    if (data.payment_storage_path) {
      const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(data.payment_storage_path, 3600)
      if (s?.signedUrl) links.payment = s.signedUrl
    }
    setUrls(links)
    setLoading(false)
  }

  if (!urls && !loading) {
    return (
      <div
        onClick={load}
        style={{ fontSize: '11px', color: '#6B6B6B', cursor: 'pointer', textDecoration: 'underline', marginBottom: '8px' }}
      >
        View documents
      </div>
    )
  }
  if (loading) return <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '8px' }}>Loading…</div>
  if (!urls.receipt && !urls.payment) return <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '8px' }}>No documents found</div>

  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
      {urls.receipt && (
        <div>
          <img
            src={urls.receipt}
            alt="Receipt"
            style={{ maxWidth: '120px', maxHeight: '90px', objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block' }}
          />
          <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '4px' }}>Receipt</div>
        </div>
      )}
      {urls.payment && (
        <div>
          <img
            src={urls.payment}
            alt="Payment proof"
            style={{ maxWidth: '120px', maxHeight: '90px', objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block' }}
          />
          <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '4px' }}>Payment proof</div>
        </div>
      )}
    </div>
  )
}

// Extra files beyond the primary receipt/payment proof (e.g. a
// multi-invoice PO expense) — plain storage paths on the expense row
// itself, same lazy-signed-URL pattern.
function SupportingAttachments({ attachments }) {
  const [urls, setUrls] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (urls || loading) return
    setLoading(true)
    const signed = {}
    for (const a of attachments) {
      const { data: s } = await supabase.storage.from('expense-documents').createSignedUrl(a.path, 3600)
      if (s?.signedUrl) signed[a.path] = s.signedUrl
    }
    setUrls(signed)
    setLoading(false)
  }

  if (!urls && !loading) {
    return (
      <div
        onClick={load}
        style={{ fontSize: '11px', color: '#6B6B6B', cursor: 'pointer', textDecoration: 'underline', marginBottom: '8px' }}
      >
        View other attachments ({attachments.length})
      </div>
    )
  }
  if (loading) return <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '8px' }}>Loading…</div>

  return (
    <div style={{ marginBottom: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      {attachments.map((a, i) => (
        urls[a.path] ? (
          <a key={i} href={urls[a.path]} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#8C3225', textDecoration: 'underline' }}>
            View {a.label}
          </a>
        ) : (
          <span key={i} style={{ fontSize: '11px', color: '#9CA3AF' }}>{a.label} not found</span>
        )
      ))}
    </div>
  )
}

export default function ExpenseApprovalCard({ expense, result, onFlag, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [flagNote, setFlagNote] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [removed, setRemoved] = useState(false)

  if (removed) return null

  // result is this expense's live policy-check outcome (re-run on load,
  // since nothing about policy checks is persisted anywhere) — falls back
  // to the coarse policy_status saved on the row while that's still loading.
  const violations = result?.violations?.length ? result.violations : []
  const flagsForApprover = (result?.flags || []).filter(f => !f.internalOnly)
  const hasViolation = violations.length > 0 || (!result && expense.policy_status === 'blocked')
  const hasFlagPrev = flagsForApprover.length > 0 || (!result && expense.policy_status === 'flagged')

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
        {[expense.category, expense.date, expense.entity].filter(Boolean).join(' · ')}
      </div>

      {/* Description */}
      {expense.description && (
        <div style={{ fontSize: '12px', color: '#4A4A4A', lineHeight: '1.4', marginBottom: '8px' }}>
          {expense.description.length > 80 ? expense.description.slice(0, 80) + '…' : expense.description}
        </div>
      )}

      {/* Policy status */}
      {hasViolation ? (
        <div style={{ fontSize: '11px', color: '#DC2626', marginBottom: '4px' }}>Policy issue flagged</div>
      ) : hasFlagPrev ? (
        <div style={{ fontSize: '11px', color: '#CA8A04', marginBottom: '4px' }}>Flagged for review</div>
      ) : (
        <div style={{ fontSize: '11px', color: '#16A34A', marginBottom: '4px' }}>Policy passed</div>
      )}

      {/* Actual policy note text — not just the coarse pass/flag/issue badge */}
      {[...violations, ...flagsForApprover].map((f, i) => (
        <div key={i} style={{
          fontSize: '11px', color: f.passed === false ? '#DC2626' : '#CA8A04',
          background: f.passed === false ? '#FEF2F2' : '#FEFCE8',
          border: `1px solid ${f.passed === false ? '#FECACA' : '#FDE68A'}`,
          borderRadius: '3px', padding: '6px 8px', marginBottom: '6px', lineHeight: '1.4',
        }}>
          {f.message}
        </div>
      ))}

      {/* All compulsory details this expense was filed with */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ fontSize: '11px', color: '#6B6B6B', cursor: 'pointer', textDecoration: 'underline', marginTop: '6px', marginBottom: expanded ? '10px' : '0' }}
      >
        {expanded ? 'Hide details' : 'View details'}
      </div>

      {expanded && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <DetailRow label="Merchant" value={expense.vendor} />
            <DetailRow label="Entity" value={expense.entity} />
            <DetailRow label="Payment Mode" value={expense.payment_method} />
            {expense.payment_method === 'Company Card' && <DetailRow label="Card No." value={expense.card_no} />}
            <DetailRow label="Who it was for" value={WHO_LABELS[expense.expense_type] || expense.expense_type} />
            {expense.attendee_count > 1 && <DetailRow label="Number of people" value={String(expense.attendee_count)} />}
            {expense.attendee_names && <DetailRow label="Attendees" value={expense.attendee_names} />}
            {expense.per_person_amount && <DetailRow label="Per person" value={`₹${Number(expense.per_person_amount).toLocaleString('en-IN')}`} />}
            <DetailRow label="PO Number" value={expense.po_number} />
            <DetailRow label="Programme" value={expense.program} />
            <DetailRow label="Donor" value={expense.donor_name} />
            <DetailRow label="Invoice Number" value={expense.invoice_number} />
            <DetailRow label="GSTIN" value={expense.gstin} />
          </div>

          {expense.capture_id && <ReceiptDocuments captureId={expense.capture_id} />}
          {!expense.capture_id && (
            <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '8px' }}>No receipt linked</div>
          )}
          {expense.supporting_attachments?.length > 0 && (
            <SupportingAttachments attachments={expense.supporting_attachments} />
          )}
        </div>
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
