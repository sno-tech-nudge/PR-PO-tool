import { supabase } from './supabase'
import { getDisplayName } from './directory'

function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function extOf(path) {
  const m = /\.[a-zA-Z0-9]+$/.exec(path || '')
  return m ? m[0] : ''
}

function safeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '-').trim()
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

// Fetches the complete, read-only Vendor -> PR -> PO -> Expense Report(s)
// chain for one Purchase Order. A PO can have more than one expense report
// against it (partial/tranche submissions), so `reportChains` is an array,
// not a single record — pass either `poId` directly or a `reportId` (its
// linked PO is resolved first) as the entry point; either way the returned
// chain is the same full picture.
export async function fetchAuditTrail({ poId, reportId }) {
  let resolvedPoId = poId
  if (!resolvedPoId && reportId) {
    const { data: r } = await supabase.from('expense_reports').select('po_id').eq('id', reportId).single()
    resolvedPoId = r?.po_id
  }
  if (!resolvedPoId) return null

  const { data: po } = await supabase.from('purchase_orders').select('*').eq('id', resolvedPoId).single()
  if (!po) return null

  const [{ data: pr }, { data: reports }] = await Promise.all([
    supabase.from('purchase_requests').select('*, vendors(*)').eq('id', po.pr_id).single(),
    supabase.from('expense_reports').select('*').eq('po_id', resolvedPoId).order('created_at', { ascending: true }),
  ])
  const vendor = pr?.vendors || null

  const { data: prApprovals } = pr
    ? await supabase.from('pr_approvals').select('*').eq('pr_id', pr.id).order('approver_level')
    : { data: [] }

  const reportChains = await Promise.all((reports || []).map(async report => {
    const [{ data: reportApprovals }, { data: reportExpenses }] = await Promise.all([
      supabase.from('report_approvals').select('*').eq('report_id', report.id).order('approver_level'),
      supabase.from('report_expenses').select('expense_details(*)').eq('report_id', report.id),
    ])
    const expenses = (reportExpenses || []).map(re => re.expense_details).filter(Boolean)
    const captureIds = expenses.map(e => e.capture_id).filter(Boolean)
    let captures = []
    if (captureIds.length) {
      const { data } = await supabase.from('expense_captures').select('*').in('id', captureIds)
      captures = data || []
    }
    const expensesWithCaptures = expenses.map(e => ({ ...e, capture: captures.find(c => c.id === e.capture_id) || null }))
    return { report, approvals: reportApprovals || [], expenses: expensesWithCaptures }
  }))

  return { po, pr, vendor, prApprovals: prApprovals || [], reportChains }
}

// Best-effort access log — never blocks the view/download it's attached to.
export async function logAuditTrailAccess({ user, poId, action }) {
  try {
    await supabase.from('audit_trail_access_log').insert({ accessed_by: user?.email || 'unknown', po_id: poId, action })
  } catch { /* non-blocking */ }
}

function addApprovalRows(doc, left, y, pageBottom, rows) {
  rows.forEach(r => {
    if (y > pageBottom) { doc.addPage(); y = 50 }
    doc.setTextColor(26, 31, 54)
    doc.setFont(undefined, 'bold')
    doc.setFontSize(11)
    doc.text(r.level, left, y)
    y += 15
    doc.setFont(undefined, 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(55, 65, 81)
    doc.text(`Approver: ${r.person}`, left + 14, y); y += 13
    doc.text(`Status: ${r.status}`, left + 14, y); y += 13
    doc.text(`Date & Time: ${r.when}`, left + 14, y); y += 22
  })
  return y
}

function sectionHeader(doc, left, y, pageBottom, title) {
  if (y > pageBottom - 20) { doc.addPage(); y = 50 }
  doc.setFontSize(13)
  doc.setFont(undefined, 'bold')
  doc.setTextColor(140, 50, 37)
  doc.text(title, left, y)
  y += 6
  doc.setDrawColor(220, 220, 220)
  doc.line(left, y, 555, y)
  return y + 18
}

// A comprehensive, multi-page, read-only PDF covering every stage of the
// chain: who submitted/approved what, and when, from the vendor's original
// registration through to reimbursement. This is the audit-facing summary
// document — actual attachments are bundled alongside it in the ZIP, not
// embedded in this PDF.
async function buildAuditTrailPDF(chain) {
  const { jsPDF } = await import('jspdf')
  const { po, pr, vendor, prApprovals, reportChains } = chain
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 40
  const pageBottom = 760
  let y = 50

  doc.setFontSize(18)
  doc.setTextColor(26, 31, 54)
  doc.text('Audit Trail', left, y)
  y += 20
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(`Vendor: ${vendor?.org_name || '—'}   ·   PR: ${pr?.pr_number || '—'}   ·   PO: ${po.po_number || '—'}`, left, y)
  y += 30

  // Vendor
  y = sectionHeader(doc, left, y, pageBottom, 'Vendor')
  doc.setFontSize(10); doc.setTextColor(55, 65, 81); doc.setFont(undefined, 'normal')
  ;[
    ['Organisation', vendor?.org_name],
    ['PAN', vendor?.pan_number],
    ['Submitted By', vendor?.submitted_by ? getDisplayName(vendor.submitted_by) : null],
    ['Submitted On', fmtDateTime(vendor?.submitted_at)],
    ['Approved By', vendor?.approved_by ? getDisplayName(vendor.approved_by) : null],
    ['Approved On', fmtDateTime(vendor?.approved_at)],
    ['Status', vendor?.status],
    vendor?.rejection_reason ? ['Rejection Reason', vendor.rejection_reason] : null,
  ].filter(Boolean).forEach(([label, val]) => {
    if (y > pageBottom) { doc.addPage(); y = 50 }
    doc.text(`${label}: ${val || '—'}`, left, y); y += 15
  })
  y += 10

  // PR
  y = sectionHeader(doc, left, y, pageBottom, 'Purchase Request')
  doc.setFontSize(10); doc.setTextColor(55, 65, 81)
  ;[
    ['PR Number', pr?.pr_number],
    ['Requested By', pr?.requested_by ? getDisplayName(pr.requested_by) : null],
    ['Submitted On', fmtDateTime(pr?.submitted_at)],
    ['Amount', pr ? `₹${Number(pr.amount || 0).toLocaleString('en-IN')}` : null],
    ['Categories', pr?.category],
    ['Purpose', pr?.purpose],
    ['Status', pr?.status],
  ].filter(Boolean).forEach(([label, val]) => {
    if (y > pageBottom) { doc.addPage(); y = 50 }
    doc.text(`${label}: ${val || '—'}`, left, y); y += 15
  })
  y += 10
  y = addApprovalRows(doc, left, y, pageBottom, (prApprovals || []).map(a => ({
    level: a.approver_name || `Level ${a.approver_level}`,
    person: a.approver_email ? getDisplayName(a.approver_email) : '—',
    status: a.status,
    when: fmtDateTime(a.actioned_at),
  })))

  // PO
  y = sectionHeader(doc, left, y, pageBottom, 'Purchase Order')
  doc.setFontSize(10); doc.setTextColor(55, 65, 81)
  ;[
    ['PO Number', po.po_number],
    ['Amount', `₹${Number(po.amount || 0).toLocaleString('en-IN')}`],
    ['Entity', po.entity],
    ['Status', po.status],
    ['Approved By (Finance)', po.approved_by ? getDisplayName(po.approved_by) : null],
    ['Approved On', fmtDateTime(po.approved_at)],
    po.rejection_reason ? ['Rejection Reason', po.rejection_reason] : null,
  ].filter(Boolean).forEach(([label, val]) => {
    if (y > pageBottom) { doc.addPage(); y = 50 }
    doc.text(`${label}: ${val || '—'}`, left, y); y += 15
  })
  y += 10

  // Expense Report(s)
  if (!reportChains.length) {
    y = sectionHeader(doc, left, y, pageBottom, 'Expense Reports')
    doc.setFontSize(10); doc.setTextColor(107, 114, 128)
    doc.text('No expense report has been submitted against this PO yet.', left, y)
    y += 20
  }
  reportChains.forEach(({ report, approvals, expenses }, idx) => {
    y = sectionHeader(doc, left, y, pageBottom, `Expense Report ${idx + 1} — ${report.report_reference || report.id}`)
    doc.setFontSize(10); doc.setTextColor(55, 65, 81)
    ;[
      ['Status', report.status],
      ['Total Amount', `₹${Number(report.total_amount || 0).toLocaleString('en-IN')}`],
      ['Submitted On', fmtDateTime(report.submitted_at || report.created_at)],
      ['Vouched By', report.vouched_by],
      ['Vouched On', fmtDateTime(report.vouched_at)],
      ['Reimbursed On', fmtDateTime(report.reimbursed_at)],
      report.rejection_reason ? ['Rejection Reason', report.rejection_reason] : null,
    ].filter(Boolean).forEach(([label, val]) => {
      if (y > pageBottom) { doc.addPage(); y = 50 }
      doc.text(`${label}: ${val || '—'}`, left, y); y += 15
    })
    y += 6
    y = addApprovalRows(doc, left, y, pageBottom, (approvals || []).map(a => ({
      level: a.approver_name || `Level ${a.approver_level}`,
      person: a.approver_email ? getDisplayName(a.approver_email) : '—',
      status: a.status,
      when: fmtDateTime(a.actioned_at),
    })))
    if (expenses.length) {
      if (y > pageBottom - 20) { doc.addPage(); y = 50 }
      doc.setFontSize(9.5); doc.setTextColor(107, 114, 128)
      doc.text(`${expenses.length} expense line item${expenses.length > 1 ? 's' : ''} — receipts/payment proofs included in the attachments folder.`, left, y)
      y += 20
    }
  })

  doc.setFontSize(8.5)
  doc.setTextColor(156, 163, 175)
  doc.text(`Generated ${fmtDateTime(new Date())}`, left, 780)

  return doc
}

// Downloads the entire chain as one ZIP: PO PDF, vendor registration
// documents, PR attachments, every linked expense report's receipts and
// payment proofs, and the multi-page Audit_Trail.pdf summary above. Purely
// additive/read-only — nothing here can modify any record.
export async function downloadAuditTrailBundle({ chain, user }) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const { po, pr, vendor, reportChains } = chain

  if (po.pdf_storage_path) {
    const { data } = await supabase.storage.from('po-pdfs').download(po.pdf_storage_path)
    if (data) zip.file(`PO/${safeName(po.po_number)}.pdf`, data)
  }

  if (vendor) {
    const vendorFolder = zip.folder('Vendor')
    for (const [field, label] of VENDOR_DOC_FIELDS) {
      if (!vendor[field]) continue
      const { data } = await supabase.storage.from('vendor-documents').download(vendor[field])
      if (data) vendorFolder.file(`${safeName(label)}${extOf(vendor[field])}`, data)
    }
  }

  if (pr) {
    const prAttachments = []
    ;(pr.quotes || []).forEach((q, i) => {
      if (q.quote_path) prAttachments.push({ path: q.quote_path, name: `Quotation_${i + 1}${q.vendor_name ? '_' + safeName(q.vendor_name) : ''}${extOf(q.quote_path)}` })
    })
    if (pr.comparative_statement_path) prAttachments.push({ path: pr.comparative_statement_path, name: `Comparative_Statement${extOf(pr.comparative_statement_path)}` })
    if (pr.advance_approval_screenshot_path) prAttachments.push({ path: pr.advance_approval_screenshot_path, name: `Advance_Approval_Screenshot${extOf(pr.advance_approval_screenshot_path)}` })
    if (prAttachments.length) {
      const folder = zip.folder('PR/Attachments')
      for (const a of prAttachments) {
        const { data } = await supabase.storage.from('pr-quotes').download(a.path)
        if (data) folder.file(a.name, data)
      }
    }
  }

  for (const { report, expenses } of reportChains) {
    const reportFolder = zip.folder(`Expense_Reports/${safeName(report.report_reference || report.id)}`)
    if (report.pdf_storage_path) {
      const { data } = await supabase.storage.from('expense-reports').download(report.pdf_storage_path)
      if (data) reportFolder.file(`Report${extOf(report.pdf_storage_path)}`, data)
    }
    for (const [i, e] of expenses.entries()) {
      const label = safeName(`${i + 1}_${e.vendor || 'expense'}_${e.date || ''}`)
      if (e.capture?.receipt_storage_path) {
        const { data } = await supabase.storage.from('expense-documents').download(e.capture.receipt_storage_path)
        if (data) reportFolder.file(`${label}_Receipt${extOf(e.capture.receipt_storage_path)}`, data)
      }
      if (e.capture?.payment_storage_path) {
        const { data } = await supabase.storage.from('expense-documents').download(e.capture.payment_storage_path)
        if (data) reportFolder.file(`${label}_Payment${extOf(e.capture.payment_storage_path)}`, data)
      }
    }
  }

  const summaryDoc = await buildAuditTrailPDF(chain)
  zip.file('Audit_Trail.pdf', summaryDoc.output('blob'))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(po.po_number || 'audit')}_audit_trail.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  await logAuditTrailAccess({ user, poId: po.id, action: 'downloaded' })

  return { ok: true }
}
