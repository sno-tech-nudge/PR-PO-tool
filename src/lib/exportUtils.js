function escapeCSV(val) {
  const s = String(val ?? '')
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCSV(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => headers.map(h => escapeCSV(row[h])).join(',')),
  ]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '' }
}

function fmtAmount(n) {
  return n != null ? Number(n).toFixed(2) : ''
}

export function reportsToRows(reports) {
  const rows = []
  for (const r of reports) {
    const expenses = (r.report_expenses || []).map(re => re.expense_details).filter(Boolean)
    if (!expenses.length) {
      rows.push(buildRow(r, null))
    } else {
      for (const exp of expenses) rows.push(buildRow(r, exp))
    }
  }
  return rows
}

function buildRow(r, exp) {
  return {
    'Report Reference':    r.report_reference || '',
    'Status':              r.status || '',
    'Entity':              r.brand || '',
    'Approval Route':      (r.approval_route || '').replace(/_/g, ' '),
    'Report Total (INR)':  fmtAmount(r.total_amount),
    'Submitted Date':      fmtDate(r.created_at),
    'Approved Date':       fmtDate(r.approved_at),
    'Reimbursed Date':     fmtDate(r.reimbursed_at),
    'Rejected Date':       fmtDate(r.rejected_at),
    'Rejection Reason':    r.rejection_reason || '',
    'Finance Notes':       r.finance_notes || '',
    'Vouched':             r.vouched_at ? `Yes — ${fmtDate(r.vouched_at)}` : 'No',
    'Expense Date':        fmtDate(exp?.date),
    'Vendor':              exp?.vendor || '',
    'Category':            exp?.category || '',
    'Amount (INR)':        fmtAmount(exp?.amount),
    'Payment Method':      exp?.payment_method || '',
    'Invoice Number':      exp?.invoice_number || '',
    'GSTIN':               exp?.gstin || '',
    'Description / Note':  exp?.description || '',
    'Policy Status':       exp?.policy_status || '',
    'Expense Type':        exp?.expense_type === 'just_me' ? 'Personal' : exp?.expense_type === 'multiple_people' ? 'Team' : (exp?.expense_type || ''),
    'Reimbursement Type':  exp?.reimbursement_type || '',
  }
}
