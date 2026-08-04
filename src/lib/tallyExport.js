// ─── Default category → Tally ledger name mapping ────────────────────────────
// Keyed off the real 21-item category list (src/components/layer2/ExpenseDetails.jsx).
// Ledger names are provisional pending Finance's actual chart of accounts — same
// caveat as the `TODO(finance)` note on the category list itself.
export const DEFAULT_LEDGER_MAP = {
  'Travel Fare':                'Travel Expenses',
  'Lodging and Boarding':       'Accommodation Expenses',
  'Food':                       'Meals & Food Expenses',
  'Bike Fare':                  'Conveyance Expenses',
  'Consultant Fee':             'Consultancy Fees',
  'Professional Fee':           'Professional Fees',
  'Retainership / Consultancy': 'Consultancy Fees',
  'Legal Fees':                 'Legal & Professional Charges',
  'Courier':                    'Courier & Postage Expenses',
  'Service':                    'Service Charges',
  'Staff Welfare':              'Staff Welfare Expenses',
  'Filing Fees':                'Filing & Registration Fees',
  'Furniture and Fixtures':     'Furniture and Fixtures',
  'Housekeeping':               'Housekeeping Expenses',
  'Leasehold Improvements':     'Leasehold Improvements',
  'Medicine':                   'Medical Expenses',
  'Relocation Allowance':       'Relocation Expenses',
  'Repairs and Maintenance':    'Repairs and Maintenance',
  'Subscription / Software':    'Subscription & Software Expenses',
  'Learning and Development':   'Training & Development Expenses',
  'Other':                      'Miscellaneous Expenses',

  // Orphaned pre-rename keys — kept so historical reports still export correctly.
  'Travel':                     'Travel Expenses',
  'Accommodation':              'Accommodation Expenses',
  'Meals':                      'Meals & Food Expenses',
  'Printing and Stationery':    'Printing & Stationery Expenses',
  'Rent Expense':               'Rent Expenses',
  'Subgranting':                'Subgrant Expenses',
  'Client Entertainment':       'Entertainment Expenses',
  'Field Visit':                'Field Visit Expenses',
  'Office Supplies':            'Office Expenses',
}

export const DEFAULT_BANK_LEDGER = 'Bank Account'
export const DEFAULT_EMPLOYEE_PAYABLE = 'Employee Reimbursable'

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toTallyDate(d) {
  if (!d) return ''
  // Handle DD/MM/YYYY
  const ddmm = String(d).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (ddmm) return `${ddmm[3]}${ddmm[2].padStart(2,'0')}${ddmm[1].padStart(2,'0')}`
  // Handle ISO
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}`
}

function fmtINR(n) {
  return Number(n || 0).toFixed(2)
}

function xmlEscape(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── Build journal entries for a single report ────────────────────────────────
export function buildJournalEntries(report, ledgerMap, bankLedger) {
  const map = { ...DEFAULT_LEDGER_MAP, ...ledgerMap }
  const bank = bankLedger || DEFAULT_BANK_LEDGER
  const expenses = (report.report_expenses || []).map(re => re.expense_details).filter(Boolean)

  // Group expenses by category → sum amounts
  const byCategory = {}
  for (const exp of expenses) {
    const cat = exp.category || 'Other'
    if (!byCategory[cat]) byCategory[cat] = { amount: 0, expenses: [] }
    byCategory[cat].amount += Number(exp.amount || 0)
    byCategory[cat].expenses.push(exp)
  }

  const date = report.reimbursed_at || report.approved_at || report.created_at
  const ref = report.report_reference || report.id
  const brand = report.brand || ''
  const total = Number(report.total_amount || 0)

  // Debit entries (expense ledgers)
  const debits = Object.entries(byCategory).map(([cat, { amount, expenses }]) => ({
    type: 'Dr',
    ledger: map[cat] || 'Miscellaneous Expenses',
    amount,
    category: cat,
    vendors: expenses.map(e => e.vendor).filter(Boolean).join(', '),
  }))

  // Credit entry (bank)
  const credits = [{
    type: 'Cr',
    ledger: bank,
    amount: total,
  }]

  return {
    date: toTallyDate(date),
    displayDate: date ? new Date(date.includes('/') ? date.split('/').reverse().join('-') : date)
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
    reference: ref,
    brand,
    total,
    narration: `Reimbursement: ${ref}${brand ? ' [' + brand + ']' : ''} — ${expenses.map(e=>e.vendor).filter(Boolean).slice(0,3).join(', ')}`,
    debits,
    credits,
  }
}

// ─── Generate Tally XML ───────────────────────────────────────────────────────
export function generateTallyXML(reports, ledgerMap, bankLedger, companyName = '') {
  const vouchers = reports.map(r => {
    const j = buildJournalEntries(r, ledgerMap, bankLedger)
    if (!j.date) return ''

    const debitLines = j.debits.map(d => `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${xmlEscape(d.ledger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>${fmtINR(d.amount)}</AMOUNT>${d.vendors ? `\n            <!-- ${xmlEscape(d.category)}: ${xmlEscape(d.vendors)} -->` : ''}
          </ALLLEDGERENTRIES.LIST>`).join('')

    const creditLines = j.credits.map(c => `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${xmlEscape(c.ledger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${fmtINR(c.amount)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`).join('')

    return `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>${j.date}</DATE>
            <REFERENCE>${xmlEscape(j.reference)}</REFERENCE>
            <NARRATION>${xmlEscape(j.narration)}</NARRATION>${debitLines}${creditLines}
          </VOUCHER>
        </TALLYMESSAGE>`
  }).filter(Boolean).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>${companyName ? `
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>` : ''}
      </REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

// ─── Generate CSV for manual Tally entry ─────────────────────────────────────
export function generateTallyCSV(reports, ledgerMap, bankLedger) {
  const rows = []
  rows.push(['Date', 'Report Ref', 'Entity', 'Voucher Type', 'Dr/Cr', 'Ledger', 'Amount (INR)', 'Narration', 'Category', 'Vendors'].join(','))

  for (const r of reports) {
    const j = buildJournalEntries(r, ledgerMap, bankLedger)
    for (const d of j.debits) {
      rows.push([
        j.displayDate, j.reference, j.brand || '', 'Payment', 'Dr',
        d.ledger, fmtINR(d.amount), j.narration, d.category, d.vendors,
      ].map(v => /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v).join(','))
    }
    for (const c of j.credits) {
      rows.push([
        j.displayDate, j.reference, j.brand || '', 'Payment', 'Cr',
        c.ledger, fmtINR(c.amount), j.narration, '', '',
      ].map(v => /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v).join(','))
    }
    // blank separator row between vouchers
    rows.push('')
  }
  return rows.join('\n')
}

// ─── Download helpers ─────────────────────────────────────────────────────────
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
