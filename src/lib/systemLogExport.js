export const CATEGORY_LABEL = {
  schema: 'Database change',
  team: 'Team and roles',
  deployment: 'App update',
  maintenance: 'Maintenance',
  download: 'Download',
}
export const categoryLabel = c => CATEGORY_LABEL[c] || c

const ACTION_LABEL = {
  csv_download: 'Downloaded a CSV',
  file_download: 'Downloaded a file',
  member_added: 'Person added',
  member_removed: 'Person removed',
  role_changed: 'Role changed',
  member_updated: 'Person updated',
  deployed: 'New version live',
  started: 'Maintenance started',
  ended: 'Maintenance ended',
}
export const actionLabel = a => ACTION_LABEL[a] || String(a || '')

// Date and time down to the second, since the exact moment is the point of this log.
export const fmtStamp = d => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '')

export const whoText = e => (e.actor_name ? `${e.actor_name}${e.actor_email ? ` (${e.actor_email})` : ''}` : e.actor_email || 'Unknown')

// Flat objects for downloadCSV.
export function systemLogRows(entries) {
  return entries.map(e => ({
    'Date & Time': fmtStamp(e.created_at),
    'Category': categoryLabel(e.category),
    'Action': actionLabel(e.action),
    'Target': e.target || '',
    'Detail': e.detail || '',
    'Done By': e.actor_name || '',
    'Done By Email': e.actor_email || '',
    'Recorded By': e.source === 'database' ? 'Database' : e.source === 'deploy' ? 'Deployment' : 'App',
  }))
}

// Same manual jsPDF pagination idiom as the activity log export, landscape.
export async function downloadSystemLogPDF(entries, subtitle, filename) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const left = 36
  const right = 806
  const pageBottom = 560
  const cols = [
    { title: 'When', x: left, w: 110 },
    { title: 'Category', x: 150, w: 80 },
    { title: 'Action', x: 234, w: 100 },
    { title: 'Target', x: 338, w: 120 },
    { title: 'Detail', x: 462, w: 190 },
    { title: 'Done by', x: 656, w: right - 656 },
  ]

  function header(y) {
    doc.setFontSize(16); doc.setTextColor(26, 31, 54); doc.setFont(undefined, 'bold')
    doc.text('System Logs', left, y)
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(107, 114, 128)
    doc.text(`${subtitle}  ·  generated ${fmtStamp(new Date())}`, left, y + 14)
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
      fmtStamp(e.created_at), categoryLabel(e.category), actionLabel(e.action), e.target || '', e.detail || '',
      `${e.actor_name || e.actor_email || ''}${e.source === 'database' ? '\n(database)' : ''}`,
    ].map((t, i) => doc.splitTextToSize(String(t), cols[i].w - 6).slice(0, 5))
    const rowH = Math.max(...cells.map(c => c.length)) * 10 + 6
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
