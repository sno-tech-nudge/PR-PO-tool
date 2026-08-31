// Read-only rendering of everything a requester filled in on the PR form —
// shared by the PO approval page (PODetail.jsx) so a PO approver sees the
// full underlying request, not just a vendor/amount/purpose summary, before
// deciding to Approve/Reject. Mirrors the "Request Details" / "Amount
// Breakdown" / "Payment Terms" / "Donor Allocation" / "Vendor" blocks on
// PRDetail.jsx — kept as a separate component (rather than importing from
// PRDetail.jsx directly) since PRDetail.jsx also carries a lot of
// action-panel state that doesn't apply here.

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '13px' }}>
      <span style={{ color: '#9CA3AF', width: '130px', flexShrink: 0, fontSize: '12px', paddingTop: '1px' }}>{label}</span>
      <span style={{ color: '#1A1F36' }}>{value || '—'}</span>
    </div>
  )
}

export default function PRRequestDetailsCard({ pr }) {
  if (!pr) return null

  return (
    <>
      {pr.ai_summary && (
        <div style={{ background: '#F8F9FA', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '14px 18px', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>AI Summary</div>
          <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.5 }}>{pr.ai_summary}</div>
        </div>
      )}

      {Number(pr.advance_percent) >= 100 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid #EF4444', borderRadius: '2px', padding: '10px 14px', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>100% Advance — FL Email Approval Required</div>
          <div style={{ fontSize: '12px', color: '#7F1D1D', lineHeight: 1.6 }}>
            This request asks for full payment in advance. Explicit Functional Leader approval over email is required before it proceeds.
            {pr.advance_fl_email_ack ? ' Requester has confirmed email approval has been / will be obtained.' : ' Requester has not confirmed email approval.'}
            {pr.advance_approval_screenshot_path ? ' Approval screenshot attached.' : ' No approval screenshot attached.'}
          </div>
        </div>
      )}

      {/* Request Details */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Request Details (as submitted)</div>
        <Row label="Budgeted" value={pr.budgeted == null ? '—' : pr.budgeted ? 'Budgeted' : 'Not Budgeted'} />
        <Row label="Expense Nature" value={pr.expense_type} />
        <Row label="Categories" value={pr.category} />
        <Row label="Entity" value={pr.entity} />
        <Row label="Program" value={pr.program} />
        <Row label="Subprogram" value={pr.subprogram} />
        <Row label="Impact Stream" value={pr.impact_stream} />
        <Row label="Purpose" value={pr.purpose} />
        <Row label="Recurring" value={pr.is_recurring ? `Yes — ${pr.recurring_frequency || ''}` : 'No'} />
        <Row label="From Date" value={fmtDate(pr.from_date)} />
        <Row label="To Date" value={fmtDate(pr.to_date)} />
        <Row label="Submitted" value={fmtDate(pr.submitted_at)} />

        {(pr.base_amount != null || pr.tax_amount != null || pr.incidental_amount != null) && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Amount Breakdown</div>
            {pr.line_items?.length > 0 ? (
              <div style={{ marginBottom: '8px' }}>
                {pr.line_items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#1A1F36' }}>{it.description || `Item ${i + 1}`}{it.category ? ` (${it.category})` : ''} — {it.quantity} × ₹{Number(it.rate_per_unit || 0).toLocaleString('en-IN')}</span>
                    <span style={{ color: '#1A1F36', fontWeight: 600 }}>₹{((Number(it.quantity) || 0) * (Number(it.rate_per_unit) || 0)).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {pr.quantity != null && <Row label="Quantity" value={pr.quantity} />}
                {pr.rate_per_unit != null && <Row label="Rate per Unit" value={`₹${Number(pr.rate_per_unit).toLocaleString('en-IN')}`} />}
              </>
            )}
            <Row label="Base" value={pr.base_amount != null ? `₹${Number(pr.base_amount).toLocaleString('en-IN')}` : '—'} />
            <Row label="Tax (GST)" value={pr.tax_amount != null ? `₹${Number(pr.tax_amount).toLocaleString('en-IN')}` : '—'} />
            {Number(pr.incidental_amount) > 0 && <Row label="Incidentals" value={`₹${Number(pr.incidental_amount).toLocaleString('en-IN')}`} />}
            <Row label="Total" value={`₹${Number(pr.amount || 0).toLocaleString('en-IN')}`} />
          </div>
        )}

        {pr.advance_percent != null && (
          <div style={{ marginTop: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Payment Terms</div>
            <Row label="Advance" value={`${Number(pr.advance_percent)}%`} />
            <Row label="After delivery" value={`${pr.after_delivery_percent != null ? Number(pr.after_delivery_percent) : 100 - Number(pr.advance_percent)}%`} />
            {Number(pr.advance_percent) >= 100 ? (
              <Row label="Credit Term" value="Not applicable — 100% advance" />
            ) : (
              <>
                {pr.credit_term_frequency && <Row label="Credit Term" value={pr.credit_term_frequency} />}
                {pr.credit_term_date && <Row label="Due Date" value={fmtDate(pr.credit_term_date)} />}
              </>
            )}
          </div>
        )}
      </div>

      {pr.single_source_justification && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Single Source Justification</div>
          <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{pr.single_source_justification}</div>
        </div>
      )}

      {pr.donor_allocations?.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px', padding: '20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Donor / Programme Allocation</div>
          {pr.donor_allocations.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
              <span>{[a.entity, a.program, a.subprogram, a.donor].filter(Boolean).join(' / ') || '—'}</span>
              <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: '12px' }}>{a.percent}%</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
