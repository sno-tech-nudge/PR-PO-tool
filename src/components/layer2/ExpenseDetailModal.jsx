import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import StatusBadge from '../shared/ExpenseStatusBadge'
import { ReceiptDocuments, SupportingAttachments, DownloadAttachmentsButton } from '../shared/ExpenseAttachments'

const WHO_LABELS = { just_me: 'Just me', my_team: 'Multiple people' }

function fmtDate(d) {
  if (!d) return '—'
  const ddmm = String(d).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  const dt = ddmm
    ? new Date(`${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`)
    : new Date(d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Row({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#111827' }}>{value}</div>
    </div>
  )
}

// Best-effort lookup of the real purchase_orders row matching this
// expense's po_number — the field on expense_details is just a text
// string (also how it arrives from migrated/historical data), so it
// doesn't always correspond to a PO actually issued through this tool.
// Falls back to showing the raw number on its own when no match exists,
// rather than hiding it.
function AttachedPO({ poNumber }) {
  const [po, setPo] = useState(undefined) // undefined = loading, null = not found

  useEffect(() => {
    let cancelled = false
    supabase
      .from('purchase_orders')
      .select('po_number, amount, status, vendors(org_name)')
      .eq('po_number', poNumber)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setPo(data || null) })
    return () => { cancelled = true }
  }, [poNumber])

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        Purchase Order
      </div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{poNumber}</div>
      {po && (
        <div style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>
          {po.vendors?.org_name}{po.vendors?.org_name ? ' · ' : ''}₹{Number(po.amount || 0).toLocaleString('en-IN')} · {po.status}
        </div>
      )}
      {po === null && (
        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
          On record from when this expense was filed — no matching PO found in this tool.
        </div>
      )}
    </div>
  )
}

// Read-only detail view for a single expense — reached by clicking any row
// in ExpenseHistoryScreen.jsx. Shows every field the expense was filed
// with (mirroring ExpenseDetails.jsx's own form fields), when its filer
// actually filled them in, plus the receipt/attachments (via the same
// shared components the approver card uses) so migrated expenses have
// somewhere to show their attachment once one is linked.
export default function ExpenseDetailModal({ expense, onClose }) {
  if (!expense) return null

  const actualAttendeeCount = expense.attendee_count
  const attendeeNames = expense.attendees?.length
    ? expense.attendees.map(a => a.name).join(', ')
    : expense.attendee_names

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#FFFFFF', width: '100%', maxWidth: '440px', maxHeight: '85vh', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
              {expense.vendor || 'Unknown vendor'}
            </div>
            <StatusBadge status={expense.status} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>
              ₹{Number(expense.amount || 0).toLocaleString('en-IN')}
            </div>
            <div
              onClick={onClose}
              style={{ fontSize: '12px', color: '#6B7280', cursor: 'pointer', marginTop: '4px' }}
            >
              Close ✕
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {expense.description && (
            <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5, marginBottom: '16px' }}>
              {expense.description}
            </div>
          )}

          {expense.po_number && <AttachedPO poNumber={expense.po_number} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: '16px' }}>
            <Row label="Date" value={fmtDate(expense.date)} />
            <Row label="Category" value={expense.category} />
            <Row label="Sub Category" value={expense.sub_category} />
            <Row label="Entity" value={expense.entity} />
            <Row label="Programme" value={expense.program} />
            <Row label="Donor" value={expense.donor_name} />
            <Row label="Nature of Expense" value={expense.expense_nature} />
            <Row label="Payment Mode" value={expense.payment_method} />
            {expense.payment_method === 'Company Card' && <Row label="Card No." value={expense.card_no} />}
            <Row label="Paid To" value={expense.paid_to} />
            <Row label="Invoice Number" value={expense.invoice_number} />
            <Row label="GSTIN" value={expense.gstin} />
            <Row label="Reference#" value={expense.reference_number} />
            <Row label="Who it was for" value={WHO_LABELS[expense.expense_type] || expense.expense_type} />
            {actualAttendeeCount > 1 && <Row label="Number of people" value={String(actualAttendeeCount)} />}
            {attendeeNames && <Row label="Attendees" value={attendeeNames} />}
            {expense.per_person_amount && <Row label="Per person" value={`₹${Number(expense.per_person_amount).toLocaleString('en-IN')}`} />}
            {expense.reimbursable != null && <Row label="Claim reimbursement" value={expense.reimbursable ? 'Yes' : 'No'} />}
          </div>

          {/* When this was actually filed — useful for migrated/historical
              rows especially, where the expense date and the day it was
              recorded can be months apart. */}
          <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '10px', marginBottom: '14px' }}>
            <Row label="Filed on" value={fmtDateTime(expense.created_at)} />
          </div>

          {/* Receipt / attachments */}
          <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '14px' }}>
            <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Attachments
            </div>
            {expense.capture_id ? (
              <ReceiptDocuments captureId={expense.capture_id} />
            ) : (
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '8px' }}>
                No receipt attached yet
              </div>
            )}
            {expense.supporting_attachments?.length > 0 && (
              <SupportingAttachments attachments={expense.supporting_attachments} />
            )}
            {(expense.capture_id || expense.supporting_attachments?.length > 0) && (
              <DownloadAttachmentsButton captureId={expense.capture_id} attachments={expense.supporting_attachments} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
