import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getDisplayName } from '../../lib/directory'
import { fetchAuditTrail, logAuditTrailAccess, downloadAuditTrailBundle } from '../../lib/auditTrail'

function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '13px' }}>
      <span style={{ color: '#9CA3AF', width: '150px', flexShrink: 0, fontSize: '12px', paddingTop: '1px' }}>{label}</span>
      <span style={{ color: '#1A1F36' }}>{value || '—'}</span>
    </div>
  )
}

function Card({ title, action, children }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '8px', padding: '20px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function ApprovalTable({ approvals }) {
  if (!approvals?.length) return <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>No approval records.</div>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
      <thead>
        <tr style={{ background: '#F8F9FA' }}>
          {['Level', 'Approver', 'Status', 'Date & Time'].map(h => (
            <th key={h} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {approvals.map((a, i) => {
          const statusColor = a.status === 'approved' ? '#15803D' : a.status === 'rejected' ? '#B91C1C' : a.status === 'waiting' ? '#9CA3AF' : '#B45309'
          return (
            <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
              <td style={{ padding: '8px 10px', fontSize: '12px', color: '#374151', fontWeight: 600 }}>{a.approver_name || a.approver_level}</td>
              <td style={{ padding: '8px 10px', fontSize: '11px', color: '#6B7280' }}>{a.approver_email ? getDisplayName(a.approver_email) : '—'}</td>
              <td style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 600, color: statusColor }}>{a.status?.charAt(0).toUpperCase() + a.status?.slice(1)}</td>
              <td style={{ padding: '8px 10px', fontSize: '12px', color: '#9CA3AF' }}>{fmtDateTime(a.actioned_at)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function AttachmentLink({ label, url }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: 'inline-block', fontSize: '12px', color: '#8C3225', textDecoration: 'none',
      border: '1px solid #f9c5b7', background: '#fdf0ed', borderRadius: '4px', padding: '5px 10px',
      marginRight: '8px', marginBottom: '8px',
    }}>
      ↗ {label}
    </a>
  )
}

const VENDOR_DOC_FIELDS = [
  ['pan_copy_path', 'PAN Copy'],
  ['cancelled_cheque_path', 'Cancelled Cheque'],
  ['registration_certificate_path', 'Registration Certificate'],
  ['msme_certificate_path', 'MSME Certificate'],
  ['gst_certificate_path', 'GST Certificate'],
  ['aadhaar_copy_path', 'Aadhaar Copy'],
  ['aadhaar_pan_link_proof_path', 'Aadhaar-PAN Link Proof'],
]

// Read-only Vendor -> PR -> PO -> Expense Report audit trail. Admin-only —
// gated both here (defense in depth) and by the button that opens this
// screen. Nothing on this page can edit any record; every control either
// opens a signed attachment URL in a new tab or navigates to the real
// (also read-mostly, action-gated-elsewhere) detail screen for that record.
export default function AuditTrail({ poId, reportId, user, onBack, onViewVendor, onViewPR, onViewPO, onViewReport }) {
  const [chain, setChain] = useState(null)
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const data = await fetchAuditTrail({ poId, reportId })
      if (cancelled) return
      setChain(data)
      setLoading(false)
      if (data) {
        logAuditTrailAccess({ user, poId: data.po.id, action: 'viewed' })
        loadSignedUrls(data)
      }
    }
    async function loadSignedUrls(data) {
      const jobs = []
      if (data.po.pdf_storage_path) jobs.push(['po-pdfs', data.po.pdf_storage_path])
      if (data.vendor) {
        for (const [field] of VENDOR_DOC_FIELDS) {
          if (data.vendor[field]) jobs.push(['vendor-documents', data.vendor[field]])
        }
      }
      if (data.pr) {
        ;(data.pr.quotes || []).forEach(q => { if (q.quote_path) jobs.push(['pr-quotes', q.quote_path]) })
        if (data.pr.comparative_statement_path) jobs.push(['pr-quotes', data.pr.comparative_statement_path])
        if (data.pr.advance_approval_screenshot_path) jobs.push(['pr-quotes', data.pr.advance_approval_screenshot_path])
      }
      for (const { report, expenses } of data.reportChains) {
        if (report.pdf_storage_path) jobs.push(['expense-reports', report.pdf_storage_path])
        for (const e of expenses) {
          if (e.capture?.receipt_storage_path) jobs.push(['expense-documents', e.capture.receipt_storage_path])
          if (e.capture?.payment_storage_path) jobs.push(['expense-documents', e.capture.payment_storage_path])
        }
      }
      const entries = await Promise.all(jobs.map(async ([bucket, path]) => {
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
        return [`${bucket}:${path}`, signed?.signedUrl || null]
      }))
      if (!cancelled) setUrls(Object.fromEntries(entries))
    }
    load()
    return () => { cancelled = true }
  }, [poId, reportId, isAdmin])

  async function handleDownload() {
    if (!chain) return
    setDownloading(true); setDownloadError(null)
    try {
      await downloadAuditTrailBundle({ chain, user })
    } catch (err) {
      setDownloadError(err.message || 'Failed to prepare the audit trail download.')
    }
    setDownloading(false)
  }

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: '#9CA3AF' }}>The audit trail is available to admins only.</div>
        <button onClick={onBack} style={{ marginTop: '16px', height: '36px', padding: '0 18px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>← Back</button>
      </div>
    )
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Loading audit trail…</div>
  if (!chain) return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: '14px', color: '#9CA3AF' }}>Nothing found for this record.</div>
      <button onClick={onBack} style={{ marginTop: '16px', height: '36px', padding: '0 18px', background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>← Back</button>
    </div>
  )

  const { po, pr, vendor, prApprovals, reportChains } = chain
  const u = (bucket, path) => urls[`${bucket}:${path}`]

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
        <span onClick={onBack} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}>Back</span>
        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
        <span style={{ fontSize: '12px', color: '#6B7280' }}>Audit Trail</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#1A1F36' }}>Audit Trail</div>
          <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>
            {vendor?.org_name} · {pr?.pr_number} · {po.po_number}
          </div>
        </div>
        <div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              height: '38px', padding: '0 18px', fontSize: '13px', fontWeight: 600,
              background: downloading ? '#9CA3AF' : '#8C3225', color: '#FFFFFF', border: 'none',
              borderRadius: '6px', cursor: downloading ? 'default' : 'pointer',
            }}
          >
            {downloading ? 'Preparing…' : '↓ Download Full Audit Trail'}
          </button>
          {downloadError && <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '6px', maxWidth: '220px', textAlign: 'right' }}>{downloadError}</div>}
        </div>
      </div>

      {/* Vendor */}
      <Card
        title="Vendor"
        action={onViewVendor && vendor && (
          <span onClick={() => onViewVendor(vendor.id)} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer', textDecoration: 'underline' }}>Open Vendor Record →</span>
        )}
      >
        {vendor ? (
          <>
            <Row label="Organisation" value={vendor.org_name} />
            <Row label="PAN" value={vendor.pan_number} />
            <Row label="Submitted By" value={vendor.submitted_by ? getDisplayName(vendor.submitted_by) : null} />
            <Row label="Submitted On" value={fmtDateTime(vendor.submitted_at)} />
            <Row label="Approved By" value={vendor.approved_by ? getDisplayName(vendor.approved_by) : null} />
            <Row label="Approved On" value={fmtDateTime(vendor.approved_at)} />
            <Row label="Status" value={vendor.status} />
            {vendor.rejection_reason && <Row label="Rejection Reason" value={vendor.rejection_reason} />}
            <div style={{ marginTop: '10px' }}>
              {VENDOR_DOC_FIELDS.map(([field, label]) => vendor[field] && (
                <AttachmentLink key={field} label={label} url={u('vendor-documents', vendor[field])} />
              ))}
            </div>
          </>
        ) : <div style={{ fontSize: '12px', color: '#9CA3AF' }}>No vendor record linked.</div>}
      </Card>

      {/* PR */}
      <Card
        title="Purchase Request"
        action={onViewPR && pr && (
          <span onClick={() => onViewPR(pr.id)} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer', textDecoration: 'underline' }}>Open PR Record →</span>
        )}
      >
        {pr ? (
          <>
            <Row label="PR Number" value={pr.pr_number} />
            <Row label="Requested By" value={pr.requested_by ? getDisplayName(pr.requested_by) : null} />
            <Row label="Submitted On" value={fmtDateTime(pr.submitted_at)} />
            <Row label="Amount" value={`₹${Number(pr.amount || 0).toLocaleString('en-IN')}`} />
            <Row label="Categories" value={pr.category} />
            <Row label="Purpose" value={pr.purpose} />
            <Row label="Status" value={pr.status} />
            <div style={{ marginTop: '10px', marginBottom: '4px' }}>
              {(pr.quotes || []).map((q, i) => q.quote_path && (
                <AttachmentLink key={i} label={`Quotation ${i + 1}${q.vendor_name ? ' — ' + q.vendor_name : ''}`} url={u('pr-quotes', q.quote_path)} />
              ))}
              {pr.comparative_statement_path && <AttachmentLink label="Comparative Statement" url={u('pr-quotes', pr.comparative_statement_path)} />}
              {pr.advance_approval_screenshot_path && <AttachmentLink label="Advance Approval Screenshot" url={u('pr-quotes', pr.advance_approval_screenshot_path)} />}
            </div>
            <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '10px' }}>Approval Trail</div>
            <ApprovalTable approvals={prApprovals} />
          </>
        ) : <div style={{ fontSize: '12px', color: '#9CA3AF' }}>No PR record linked.</div>}
      </Card>

      {/* PO */}
      <Card
        title="Purchase Order"
        action={onViewPO && (
          <span onClick={() => onViewPO(po.id)} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer', textDecoration: 'underline' }}>Open PO Record →</span>
        )}
      >
        <Row label="PO Number" value={po.po_number} />
        <Row label="Amount" value={`₹${Number(po.amount || 0).toLocaleString('en-IN')}`} />
        <Row label="Entity" value={po.entity} />
        <Row label="Status" value={po.status} />
        <Row label="Approved By (Finance)" value={po.approved_by ? getDisplayName(po.approved_by) : null} />
        <Row label="Approved On" value={fmtDateTime(po.approved_at)} />
        {po.rejection_reason && <Row label="Rejection Reason" value={po.rejection_reason} />}
        {po.pdf_storage_path && <div style={{ marginTop: '10px' }}><AttachmentLink label="PO PDF" url={u('po-pdfs', po.pdf_storage_path)} /></div>}
      </Card>

      {/* Expense Reports */}
      {reportChains.length === 0 ? (
        <Card title="Expense Reports">
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>No expense report has been submitted against this PO yet.</div>
        </Card>
      ) : reportChains.map(({ report, approvals, expenses }) => (
        <Card
          key={report.id}
          title={`Expense Report — ${report.report_reference || report.id}`}
          action={onViewReport && (
            <span onClick={() => onViewReport(report.id)} style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer', textDecoration: 'underline' }}>Open Report Record →</span>
          )}
        >
          <Row label="Status" value={report.status} />
          <Row label="Total Amount" value={`₹${Number(report.total_amount || 0).toLocaleString('en-IN')}`} />
          <Row label="Submitted On" value={fmtDateTime(report.submitted_at || report.created_at)} />
          <Row label="Vouched By" value={report.vouched_by} />
          <Row label="Vouched On" value={fmtDateTime(report.vouched_at)} />
          <Row label="Reimbursed On" value={fmtDateTime(report.reimbursed_at)} />
          {report.rejection_reason && <Row label="Rejection Reason" value={report.rejection_reason} />}
          {report.pdf_storage_path && <div style={{ marginTop: '10px' }}><AttachmentLink label="Report PDF" url={u('expense-reports', report.pdf_storage_path)} /></div>}

          <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '10px' }}>Approval Trail</div>
          <ApprovalTable approvals={approvals} />

          {expenses.length > 0 && (
            <>
              <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '14px', marginBottom: '6px' }}>Expense Line Items</div>
              {expenses.map((e, i) => (
                <div key={e.id} style={{ borderTop: i > 0 ? '1px solid #F3F4F6' : 'none', padding: '8px 0' }}>
                  <div style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>
                    {e.vendor || 'Expense'} · {e.category || '—'} · ₹{Number(e.amount || 0).toLocaleString('en-IN')} · {e.date || '—'}
                  </div>
                  <AttachmentLink label="Receipt" url={u('expense-documents', e.capture?.receipt_storage_path)} />
                  <AttachmentLink label="Payment Proof" url={u('expense-documents', e.capture?.payment_storage_path)} />
                </div>
              ))}
            </>
          )}
        </Card>
      ))}
    </div>
  )
}
