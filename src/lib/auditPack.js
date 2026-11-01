import { supabase } from './supabase'
import { getDisplayName } from './directory'
import { logSystem } from './systemLog'
import { categoryLabel, actionLabel as systemActionLabel, fmtStamp } from './systemLogExport'
import { actionLabel as activityActionLabel } from './activityLogExport'

// One zip for an audit: for every report submitted in a date range, its summary,
// its expenses, the receipts and payment proofs, and everything Finance did on
// each line (ticks, flags, questions and answers), plus the system logs and the
// approval trail for the same period. Built in the browser from what is already
// in the system; nothing is stored.

const MAX_REPORTS = 200
const LOG_PAGE = 1000
const LOG_CAP = 20000

const money = n => (n == null || n === '' ? '' : String(Math.round((Number(n) || 0) * 100) / 100))
const safeName = s => String(s || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file'
const extOf = p => { const m = String(p || '').match(/\.[a-zA-Z0-9]{2,5}$/); return m ? m[0].toLowerCase() : '' }
const day = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

function csvCell(v) {
  const s = String(v ?? '')
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return '﻿' + [headers.map(csvCell).join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\n')
}

const VOUCH_VERB = { clear: 'Vouched the line', flag: 'Flagged (internal note)', query: 'Asked the employee', reply: 'Employee replied', reopen: 'Took back the vouch' }

async function fetchAllSystemLogs(fromIso, toIso) {
  const out = []
  for (let from = 0; from < LOG_CAP; from += LOG_PAGE) {
    const { data, error } = await supabase.from('system_logs').select('*')
      .gte('created_at', fromIso).lte('created_at', toIso)
      .order('created_at', { ascending: true }).range(from, from + LOG_PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < LOG_PAGE) break
  }
  return out
}

// Downloads files a few at a time rather than one by one.
async function downloadAll(jobs, onEach) {
  let next = 0
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]
      const { data } = await supabase.storage.from('expense-documents').download(job.path)
      onEach(job, data)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
}

export async function buildAuditPack({ from, to, user, onProgress = () => {} }) {
  const fromIso = new Date(`${from}T00:00:00`).toISOString()
  const toIso = new Date(`${to}T23:59:59.999`).toISOString()
  // A report belongs to the period it was submitted in (or created in, if never submitted).
  const inRange = `and(submitted_at.gte.${fromIso},submitted_at.lte.${toIso}),and(submitted_at.is.null,created_at.gte.${fromIso},created_at.lte.${toIso})`

  onProgress('Finding the reports')
  const { count } = await supabase.from('expense_reports').select('id', { count: 'exact', head: true }).neq('status', 'draft').or(inRange)
  if ((count || 0) > MAX_REPORTS) {
    return { ok: false, reason: `${count} reports fall in that period, which is more than one pack can hold (${MAX_REPORTS}). Pick a shorter period.` }
  }
  const { data: reports, error } = await supabase
    .from('expense_reports')
    .select('*, report_approvals(*), report_expenses(expense_details(*))')
    .neq('status', 'draft').or(inRange)
    .order('created_at', { ascending: true })
  if (error) return { ok: false, reason: `Could not load the reports: ${error.message}` }

  const reportIds = (reports || []).map(r => r.id)
  const captureIds = [...new Set((reports || []).flatMap(r => (r.report_expenses || []).map(re => re.expense_details?.capture_id).filter(Boolean)))]

  onProgress('Collecting the vouch history')
  const [{ data: vouch }, { data: activity }, { data: captures }] = await Promise.all([
    reportIds.length ? supabase.from('expense_vouch_events').select('*').in('report_id', reportIds).order('created_at', { ascending: true }) : { data: [] },
    reportIds.length ? supabase.from('activity_log').select('*').in('entity_id', reportIds).order('created_at', { ascending: true }) : { data: [] },
    captureIds.length ? supabase.from('expense_captures').select('id, receipt_storage_path, payment_storage_path, ai_content_flag').in('id', captureIds) : { data: [] },
  ])
  const captureById = Object.fromEntries((captures || []).map(c => [c.id, c]))

  onProgress('Collecting the system logs')
  const systemLogs = await fetchAllSystemLogs(fromIso, toIso)

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const jobs = []
  const missing = []
  const summaryRows = []

  for (const r of reports || []) {
    const folderName = safeName(r.report_reference || r.id)
    const folder = zip.folder(`Reports/${folderName}`)
    const lines = (r.report_expenses || []).map(re => re.expense_details).filter(Boolean)
    const events = (vouch || []).filter(v => v.report_id === r.id)
    const lineName = Object.fromEntries(lines.map((l, i) => [l.id, `${i + 1}. ${l.vendor || 'Expense'} ${money(l.amount)}`]))
    const employee = r.employee_email ? `${getDisplayName(r.employee_email)} (${r.employee_email})` : ''
    const deductions = lines.reduce((s, l) => s + (Number(l.deduction_amount) || 0), 0)
    const tds = lines.reduce((s, l) => s + (Number(l.tds_amount) || 0), 0)

    const approvals = (r.report_approvals || []).slice().sort((a, b) => String(a.approver_level).localeCompare(String(b.approver_level)))
    folder.file('summary.txt', [
      `EXPENSE REPORT ${r.report_reference || r.id}`,
      '',
      `Employee:        ${employee}`,
      `Entity:          ${r.brand || ''}`,
      `Payment type:    ${r.payment_kind === 'vendor' ? 'Vendor payment' : 'Reimbursement'}`,
      `Status:          ${r.status}`,
      `Submitted:       ${fmtStamp(r.submitted_at || r.created_at)}`,
      r.approved_at ? `Approved:        ${fmtStamp(r.approved_at)}` : null,
      r.reimbursed_at ? `Reimbursed:      ${fmtStamp(r.reimbursed_at)}` : null,
      r.rejected_at ? `Returned:        ${fmtStamp(r.rejected_at)}${r.rejection_reason ? ` (${r.rejection_reason})` : ''}` : null,
      `Processed by:    ${r.assigned_to_name || r.assigned_to_email || 'Not assigned'}`,
      r.business_purpose ? `Purpose:         ${r.business_purpose}` : null,
      '',
      `Claimed:         INR ${money(r.total_amount)}`,
      deductions ? `Deductions:      INR ${money(deductions)}` : null,
      tds ? `TDS:             INR ${money(tds)}` : null,
      `Net payable:     INR ${money(r.net_payable != null ? r.net_payable : r.total_amount)}`,
      Number(r.advance_applied) > 0 ? `From advance:    INR ${money(r.advance_applied)}` : null,
      r.advance_choice ? `Advance answer:  ${r.advance_choice === 'deduct' ? 'Chose to deduct from advance' : `Chose not to deduct${r.advance_choice_reason ? ` (${r.advance_choice_reason})` : ''}`}` : null,
      '',
      'APPROVAL TRAIL',
      ...(approvals.length ? approvals.map(a => `  ${a.approver_name || a.approver_level}: ${a.status}${a.approver_email ? ` by ${getDisplayName(a.approver_email)}` : ''}${a.actioned_at ? ` on ${fmtStamp(a.actioned_at)}` : ''}${a.notes ? `. ${a.notes}` : ''}`) : ['  (none recorded)']),
      '',
      r.vouched_at ? `Vouched:         ${fmtStamp(r.vouched_at)}${r.vouched_by ? ` by ${r.vouched_by}` : ''}` : 'Vouched:         not as a whole report',
      r.finance_notes ? `Finance notes:   ${r.finance_notes}` : null,
    ].filter(v => v !== null).join('\n'))

    folder.file('expenses.csv', toCsv(lines.map((l, i) => {
      const cap = captureById[l.capture_id]
      const last = events.filter(e => e.expense_id === l.id).slice(-1)[0]
      return {
        'No': i + 1, 'Date': l.date || '', 'Vendor': l.vendor || '', 'Category': l.category || '', 'Amount (INR)': money(l.amount),
        'Payment mode': l.payment_method || '', 'Invoice no.': l.invoice_number || '', 'GSTIN': l.gstin || '',
        'Deducted (INR)': money(l.deduction_amount), 'Deduction reason': l.deduction_reason || '',
        'TDS (INR)': money(l.tds_amount), 'TDS section': l.tds_section || '',
        'Reason for being over policy': l.policy_justification || '', 'Reason for no PR/PO': l.no_po_reason || '',
        'Vouch status': last ? VOUCH_VERB[last.kind] : 'Not vouched',
        'AI content label': cap?.ai_content_flag ? 'Yes' : '',
        'Receipt file': cap?.receipt_storage_path ? `receipts/${i + 1}_${safeName(l.vendor)}_receipt${extOf(cap.receipt_storage_path)}` : 'None',
      }
    })))

    folder.file('vouch_history.csv', toCsv(events.map(e => ({
      'Date and time': fmtStamp(e.created_at), 'Line': lineName[e.expense_id] || e.expense_id,
      'What happened': VOUCH_VERB[e.kind] || e.kind, 'By': e.author_name || e.author_email || '', 'Role': e.author_role || '', 'Text': e.body || '',
    }))))

    folder.file('activity.csv', toCsv((activity || []).filter(a => a.entity_id === r.id).map(a => ({
      'Date and time': fmtStamp(a.created_at), 'Action': activityActionLabel(a.action),
      'Change': [a.from_value, a.to_value].filter(Boolean).join(' to '), 'By': a.actor_name || a.actor_email || '',
      'On behalf of': a.on_behalf_of || '', 'Note': a.note || '',
    }))))

    lines.forEach((l, i) => {
      const cap = captureById[l.capture_id]
      if (cap?.receipt_storage_path) jobs.push({ path: cap.receipt_storage_path, folder, name: `receipts/${i + 1}_${safeName(l.vendor)}_receipt${extOf(cap.receipt_storage_path)}`, report: r.report_reference })
      if (cap?.payment_storage_path) jobs.push({ path: cap.payment_storage_path, folder, name: `receipts/${i + 1}_${safeName(l.vendor)}_payment_proof${extOf(cap.payment_storage_path)}`, report: r.report_reference })
      ;(l.supporting_attachments || []).forEach((a, k) => {
        if (a?.path) jobs.push({ path: a.path, folder, name: `receipts/${i + 1}_${safeName(l.vendor)}_attachment_${k + 1}${extOf(a.path)}`, report: r.report_reference })
      })
    })

    summaryRows.push({
      'Report': r.report_reference || r.id, 'Employee': employee, 'Entity': r.brand || '', 'Type': r.payment_kind === 'vendor' ? 'Vendor payment' : 'Reimbursement',
      'Status': r.status, 'Submitted': day(r.submitted_at || r.created_at), 'Approved': day(r.approved_at), 'Expenses': lines.length,
      'Claimed (INR)': money(r.total_amount), 'Deductions (INR)': money(deductions), 'TDS (INR)': money(tds), 'Net payable (INR)': money(r.net_payable != null ? r.net_payable : r.total_amount),
      'Vouch events': events.length, 'Processed by': r.assigned_to_name || r.assigned_to_email || '',
    })
  }

  let done = 0
  onProgress(jobs.length ? `Collecting receipts (0 of ${jobs.length})` : 'Collecting receipts')
  await downloadAll(jobs, (job, data) => {
    done += 1
    if (data) job.folder.file(job.name, data)
    else missing.push(`${job.report}: ${job.name} (could not be downloaded)`)
    if (done % 5 === 0 || done === jobs.length) onProgress(`Collecting receipts (${done} of ${jobs.length})`)
  })

  onProgress('Packing it up')
  zip.file('reports_summary.csv', toCsv(summaryRows))
  zip.file('system_logs.csv', toCsv(systemLogs.map(e => ({
    'Date and time': fmtStamp(e.created_at), 'Event': categoryLabel(e.category), 'Action': systemActionLabel(e.action),
    'Target': e.target || '', 'Detail': e.detail || '', 'Done by': e.actor_name || '', 'Done by email': e.actor_email || '',
    'Recorded by': e.source === 'database' ? 'Database' : e.source === 'deploy' ? 'Deployment' : 'App',
  }))))
  const generatedBy = user?.name ? `${user.name} (${user.email})` : user?.email || 'an admin'
  zip.file('README.txt', [
    'AUDIT PACK',
    '',
    `Period:        ${day(fromIso)} to ${day(toIso)}`,
    `Generated:     ${fmtStamp(new Date())} by ${generatedBy}`,
    '',
    `Reports:       ${reports?.length || 0} (every report submitted in the period, except drafts)`,
    `Receipts:      ${jobs.length - missing.length} of ${jobs.length} files`,
    `System logs:   ${systemLogs.length} entries for the period`,
    '',
    'WHAT IS INSIDE',
    '  reports_summary.csv       one line per report',
    '  system_logs.csv           changes to the system in the period: database changes, people and',
    '                            roles, new app versions, maintenance, CSV downloads',
    '  Reports/<reference>/',
    '    summary.txt             the report, its totals and its approval trail',
    '    expenses.csv            each expense, with deductions, TDS and reasons given',
    '    vouch_history.csv       every tick, flag, question and answer on each line, with who and when',
    '    activity.csv            the activity log for the report',
    '    receipts/               the receipt, payment proof and other attachments for each expense',
    '',
    systemLogs.length >= LOG_CAP ? `Note: the system logs were cut at ${LOG_CAP} entries. Use a shorter period for the rest.` : null,
    missing.length ? 'FILES THAT COULD NOT BE COLLECTED' : null,
    ...missing.map(m => `  ${m}`),
  ].filter(v => v !== null).join('\n'))

  const blob = await zip.generateAsync({ type: 'blob' })
  const filename = `nudge-audit-pack-${from}-to-${to}.zip`
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  logSystem({
    category: 'download', action: 'audit_pack_download', target: filename,
    detail: `${reports?.length || 0} reports, ${jobs.length - missing.length} receipts, ${systemLogs.length} system log entries`,
    meta: { from, to, reports: reports?.length || 0 },
  })
  return { ok: true, reports: reports?.length || 0, receipts: jobs.length - missing.length, logs: systemLogs.length, missing: missing.length }
}
