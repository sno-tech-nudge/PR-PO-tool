const ENTITY_LABEL = {
  pr: 'Purchase Request', po: 'Purchase Order', report: 'Expense Report',
  expense: 'Expense', vendor: 'Vendor', delegation: 'Delegation',
}
export const entityLabel = t => ENTITY_LABEL[t] || t

export function actionLabel(a) {
  return String(a || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}

export function changeText(e) {
  if (e.from_value && e.to_value) return `${e.from_value} → ${e.to_value}`
  return e.to_value || e.from_value || ''
}

// Flat objects for downloadCSV (lib/exportUtils.js derives headers from keys).
export function activityToRows(entries) {
  return entries.map(e => ({
    'Date & Time': fmtDateTime(e.created_at),
    'Record Type': entityLabel(e.entity_type),
    'Reference': e.entity_ref || e.entity_id,
    'Action': actionLabel(e.action),
    'Change': changeText(e),
    'Done By': e.actor_name || e.actor_email || '',
    'Done By Email': e.actor_email || '',
    'On Behalf Of': e.on_behalf_of || '',
    'Note': e.note || '',
  }))
}

// Same manual jsPDF pagination idiom as buildAuditTrailPDF in auditTrail.js,
// landscape so the columns fit.
export async function downloadActivityLogPDF(entries, subtitle, filename) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const left = 36
  const right = 806
  const pageBottom = 560
  const cols = [
    { title: 'When', x: left, w: 96 },
    { title: 'Record', x: 136, w: 150 },
    { title: 'Action', x: 290, w: 110 },
    { title: 'Change', x: 404, w: 130 },
    { title: 'Done by', x: 538, w: 100 },
    { title: 'Note', x: 642, w: right - 642 },
  ]

  function header(y) {
    doc.setFontSize(16); doc.setTextColor(26, 31, 54); doc.setFont(undefined, 'bold')
    doc.text('Activity Log', left, y)
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(107, 114, 128)
    doc.text(`${subtitle}   ·   ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}   ·   generated ${fmtDateTime(new Date())}`, left, y + 14)
    return y + 34
  }
  function colHeader(y) {
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(140, 50, 37)
    cols.forEach(c => doc.text(c.title.toUpperCase(), c.x, y))
    doc.setDrawColor(220, 220, 220); doc.line(left, y + 4, right, y + 4)
    return y + 16
  }

  let y = colHeader(header(44))
  doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(55, 65, 81)

  for (const e of entries) {
    const cells = [
      fmtDateTime(e.created_at),
      `${entityLabel(e.entity_type)}${e.entity_ref ? `\n${e.entity_ref}` : ''}`,
      actionLabel(e.action),
      changeText(e),
      `${e.actor_name || e.actor_email || ''}${e.on_behalf_of ? `\nfor ${e.on_behalf_of}` : ''}`,
      e.note || '',
    ].map((t, i) => doc.splitTextToSize(String(t), cols[i].w - 6).slice(0, 4))
    const lines = Math.max(...cells.map(c => c.length))
    const rowH = lines * 10 + 6
    if (y + rowH > pageBottom) {
      doc.addPage()
      y = colHeader(44)
      doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(55, 65, 81)
    }
    cells.forEach((c, i) => doc.text(c, cols[i].x, y))
    y += rowH
    doc.setDrawColor(240, 240, 240); doc.line(left, y - 4, right, y - 4)
  }

  doc.save(filename)
}
