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

// A single-page PDF listing the approver name, status, and date/time stamp
// for every level of the PR's approval chain plus the PO's own Finance
// approval — the "approval flow" document requested alongside the PO PDF
// and attachments in the one-click download bundle.
async function buildApprovalFlowPDF(pr, po, approvals) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 40
  let y = 50

  doc.setFontSize(16)
  doc.text('Approval Flow', left, y)
  y += 20
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(`PR ${pr.pr_number || '—'}  ·  PO ${po.po_number || '—'}`, left, y)
  y += 16
  doc.setDrawColor(220, 220, 220)
  doc.line(left, y, 555, y)
  y += 24

  const rows = [
    ...(approvals || []).map(a => ({
      level: a.approver_name || `Level ${a.approver_level}`,
      person: a.approver_email ? getDisplayName(a.approver_email) : '—',
      status: a.status,
      when: fmtDateTime(a.actioned_at),
    })),
    {
      level: 'PO Approval (Finance)',
      person: po.approved_by ? getDisplayName(po.approved_by) : '—',
      status: po.status === 'rejected' ? 'rejected' : po.approved_at ? 'approved' : po.status,
      when: fmtDateTime(po.approved_at),
    },
  ]

  rows.forEach(r => {
    doc.setTextColor(26, 31, 54)
    doc.setFont(undefined, 'bold')
    doc.setFontSize(12)
    doc.text(r.level, left, y)
    y += 16
    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(55, 65, 81)
    doc.text(`Approver: ${r.person}`, left + 16, y); y += 14
    doc.text(`Status: ${r.status}`, left + 16, y); y += 14
    doc.text(`Date & Time: ${r.when}`, left + 16, y); y += 26
  })

  doc.setFontSize(9)
  doc.setTextColor(156, 163, 175)
  doc.text(`Generated ${fmtDateTime(new Date())}`, left, y + 6)

  return doc
}

// Bundles everything relevant to one Purchase Order into a single ZIP so a
// single click downloads: (1) the PO PDF, (2) every attachment on the
// underlying PR (quotations, comparative statement, advance approval
// screenshot), and (3) an approval flow document with approver name +
// timestamp per level. Returns { ok, missingPdf } — missingPdf is true when
// the PO PDF hasn't been generated yet (rare: only POs approved before PDF
// generation existed, or a prior generation failure), in which case the zip
// still contains the attachments and approval flow.
export async function downloadPOBundle({ po, pr }) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  let missingPdf = false

  if (po.pdf_storage_path) {
    const { data } = await supabase.storage.from('po-pdfs').download(po.pdf_storage_path)
    if (data) zip.file(`${safeName(po.po_number)}.pdf`, data)
    else missingPdf = true
  } else {
    missingPdf = true
  }

  const attachments = []
  ;(pr.quotes || []).forEach((q, i) => {
    if (q.quote_path) attachments.push({ path: q.quote_path, name: `Quotation_${i + 1}${q.vendor_name ? '_' + safeName(q.vendor_name) : ''}${extOf(q.quote_path)}` })
  })
  if (pr.comparative_statement_path) {
    attachments.push({ path: pr.comparative_statement_path, name: `Comparative_Statement${extOf(pr.comparative_statement_path)}` })
  }
  if (pr.advance_approval_screenshot_path) {
    attachments.push({ path: pr.advance_approval_screenshot_path, name: `Advance_Approval_Screenshot${extOf(pr.advance_approval_screenshot_path)}` })
  }

  if (attachments.length) {
    const folder = zip.folder('Attachments')
    for (const a of attachments) {
      const { data } = await supabase.storage.from('pr-quotes').download(a.path)
      if (data) folder.file(a.name, data)
    }
  }

  const { data: approvals } = await supabase.from('pr_approvals').select('*').eq('pr_id', pr.id).order('approver_level')
  const flowDoc = await buildApprovalFlowPDF(pr, po, approvals || [])
  zip.file('Approval_Flow.pdf', flowDoc.output('blob'))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(po.po_number || 'PO')}_bundle.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { ok: true, missingPdf }
}
