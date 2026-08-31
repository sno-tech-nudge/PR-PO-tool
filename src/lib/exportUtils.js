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

function maskAadhaar(a) {
  if (!a || a.length < 4) return ''
  return `XXXX-XXXX-${a.slice(-4)}`
}

// Vendor export field superset — keys map to columns; label is the CSV
// header. Aadhaar is always masked regardless of selection (never the full
// number in an exported file).
export const VENDOR_EXPORT_FIELDS = [
  { key: 'vendor_id', label: 'Vendor ID', value: v => v.vendor_id || '' },
  { key: 'org_name', label: 'Organisation', value: v => v.org_name || '' },
  { key: 'org_type', label: 'Type', value: v => v.org_type || '' },
  { key: 'nature_of_business', label: 'Nature of Business', value: v => v.nature_of_business || '' },
  { key: 'pan_number', label: 'PAN', value: v => v.pan_number || '' },
  { key: 'gstin', label: 'GSTIN', value: v => v.gstin || '' },
  { key: 'msme_registration_number', label: 'MSME Registration No.', value: v => v.is_msme ? (v.msme_details || '') : '' },
  { key: 'aadhaar_number', label: 'Aadhaar Number', value: v => maskAadhaar(v.aadhaar_number) },
  { key: 'location', label: 'Location', value: v => [v.city, v.state].filter(Boolean).join(', ') },
  { key: 'contact_person', label: 'Contact Person', value: v => v.contact_person || '' },
  { key: 'phone', label: 'Phone', value: v => v.phone || '' },
  { key: 'email', label: 'Email', value: v => v.email || '' },
  { key: 'bank_name', label: 'Bank Name', value: v => v.bank_name || '' },
  { key: 'ifsc_code', label: 'IFSC Code', value: v => v.ifsc_code || '' },
  { key: 'submitted_by', label: 'Submitted By', value: v => v.submitted_by || '' },
  { key: 'status', label: 'Status', value: v => v.status || '' },
  { key: 'submitted_at', label: 'Submitted Date', value: v => fmtDate(v.submitted_at) },
  { key: 'approved_at', label: 'Approved Date', value: v => fmtDate(v.approved_at) },
]

export function vendorsToRows(vendors, fieldKeys) {
  const fields = VENDOR_EXPORT_FIELDS.filter(f => fieldKeys.includes(f.key))
  return vendors.map(v => {
    const row = {}
    for (const f of fields) row[f.label] = f.value(v)
    return row
  })
}

// Purchase Order export field superset — po is the row from POList.jsx's
// query, joined with its linked purchase_requests and vendors rows so both
// the PO's own fields and the underlying request's full details can be
// exported together (a PO on its own is mostly just a number/amount/status;
// almost everything useful is on the PR it was generated from).
export const PO_EXPORT_FIELDS = [
  { key: 'po_number', label: 'PO Number', value: po => po.po_number || '' },
  { key: 'status', label: 'Status', value: po => po.status || '' },
  { key: 'entity', label: 'Entity', value: po => po.entity || '' },
  { key: 'amount', label: 'Amount (INR)', value: po => fmtAmount(po.amount) },
  { key: 'generated_at', label: 'Created Date', value: po => fmtDate(po.generated_at) },
  { key: 'approved_at', label: 'Approved / Issued Date', value: po => fmtDate(po.approved_at) },
  { key: 'approved_by', label: 'Approved By', value: po => po.approved_by || '' },
  { key: 'rejection_reason', label: 'Rejection Reason', value: po => po.rejection_reason || '' },
  { key: 'pr_number', label: 'Linked PR Number', value: po => po.purchase_requests?.pr_number || '' },
  { key: 'requested_by', label: 'Requested By', value: po => po.purchase_requests?.requested_by || '' },
  { key: 'purpose', label: 'Purpose', value: po => po.purchase_requests?.purpose || '' },
  { key: 'category', label: 'Categories', value: po => po.purchase_requests?.category || '' },
  { key: 'budgeted', label: 'Budgeted', value: po => po.purchase_requests?.budgeted == null ? '' : po.purchase_requests.budgeted ? 'Budgeted' : 'Not Budgeted' },
  { key: 'expense_type', label: 'Expense Nature', value: po => po.purchase_requests?.expense_type || '' },
  { key: 'program', label: 'Program', value: po => po.purchase_requests?.program || '' },
  { key: 'subprogram', label: 'Subprogram', value: po => po.purchase_requests?.subprogram || '' },
  { key: 'donor_name', label: 'Donor', value: po => po.purchase_requests?.donor_name || '' },
  { key: 'from_date', label: 'From Date', value: po => fmtDate(po.purchase_requests?.from_date) },
  { key: 'to_date', label: 'To Date', value: po => fmtDate(po.purchase_requests?.to_date) },
  { key: 'is_recurring', label: 'Recurring', value: po => po.purchase_requests?.is_recurring ? `Yes — ${po.purchase_requests.recurring_frequency || ''}` : 'No' },
  { key: 'base_amount', label: 'Base Amount (INR)', value: po => fmtAmount(po.purchase_requests?.base_amount) },
  { key: 'tax_amount', label: 'Tax (INR)', value: po => fmtAmount(po.purchase_requests?.tax_amount) },
  { key: 'incidental_amount', label: 'Incidentals (INR)', value: po => fmtAmount(po.purchase_requests?.incidental_amount) },
  { key: 'advance_percent', label: 'Advance %', value: po => po.purchase_requests?.advance_percent != null ? String(po.purchase_requests.advance_percent) : '' },
  { key: 'credit_term_frequency', label: 'Credit Term', value: po => Number(po.purchase_requests?.advance_percent) >= 100 ? 'N/A — 100% advance' : (po.purchase_requests?.credit_term_frequency || '') },
  { key: 'credit_term_date', label: 'Credit Term Due Date', value: po => fmtDate(po.purchase_requests?.credit_term_date) },
  { key: 'vendor_id', label: 'Vendor ID', value: po => po.vendors?.vendor_id || '' },
  { key: 'vendor_org_name', label: 'Vendor Name', value: po => po.vendors?.org_name || '' },
  { key: 'vendor_org_type', label: 'Vendor Type', value: po => po.vendors?.org_type || '' },
  { key: 'vendor_pan', label: 'Vendor PAN', value: po => po.vendors?.pan_number || '' },
  { key: 'vendor_gstin', label: 'Vendor GSTIN', value: po => po.vendors?.gstin || '' },
  { key: 'vendor_bank_name', label: 'Vendor Bank', value: po => po.vendors?.bank_name || '' },
  { key: 'vendor_ifsc', label: 'Vendor IFSC', value: po => po.vendors?.ifsc_code || '' },
]

export function posToRows(pos, fieldKeys) {
  const fields = PO_EXPORT_FIELDS.filter(f => fieldKeys.includes(f.key))
  return pos.map(po => {
    const row = {}
    for (const f of fields) row[f.label] = f.value(po)
    return row
  })
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
