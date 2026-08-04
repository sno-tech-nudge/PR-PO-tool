const ROUTE_LABEL = {
  reporting_manager: 'Reporting Manager',
  manager_and_fl: 'Reporting Manager and Functional Lead',
  manager_fl_coo: 'Reporting Manager, Functional Lead and COO',
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const parts = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (parts) {
    const d = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]))
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const dash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) {
    const d = new Date(parseInt(dash[3]), parseInt(dash[2]) - 1, parseInt(dash[1]))
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  return dateStr
}

function truncate(str, len) {
  if (!str) return '—'
  return str.length > len ? str.slice(0, len) + '…' : str
}

function PdfField({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '10px', color: '#6B6B6B', marginBottom: '2px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#1A1A1A', fontFamily: 'system-ui, -apple-system, sans-serif' }}>{value}</div>
    </div>
  )
}

function CoverPage({ expenses, reportData }) {
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)

  return (
    <div style={{
      width: '794px', height: '1122px', background: '#FFFFFF',
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      pageBreakAfter: 'always',
    }}>
      <div style={{ height: '4px', background: '#1A1A1A', flexShrink: 0 }} />

      <div style={{ padding: '40px', flex: 1 }}>
        <div style={{
          fontSize: '11px', fontWeight: 600, color: '#6B6B6B',
          letterSpacing: '0.15em', fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          THE/NUDGE INSTITUTE
        </div>
        <div style={{ height: '1px', background: '#E8E8E8', margin: '8px 0 32px' }} />

        <div style={{ fontSize: '32px', fontFamily: 'Georgia, serif', fontWeight: 400, color: '#1A1A1A', marginBottom: '40px' }}>
          Expense Report
        </div>

        {[
          ['Employee', reportData.employeeName || 'Team Member'],
          ['Entity', reportData.entity || 'The Nudge Institute'],
          ['Report reference', reportData.reference],
          ['Period', reportData.period],
          ['Generated', reportData.generatedAt],
          ['Submitted to', ROUTE_LABEL[reportData.approvalRoute?.route] || '—'],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', height: '32px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            <div style={{ width: '160px', fontSize: '11px', color: '#6B6B6B', flexShrink: 0 }}>{label}</div>
            <div style={{ fontSize: '13px', color: '#1A1A1A' }}>{value}</div>
          </div>
        ))}

        <div style={{ height: '1px', background: '#E8E8E8', margin: '32px 0' }} />

        <div>
          <div style={{
            fontSize: '11px', color: '#6B6B6B', marginBottom: '8px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            Total claimed
          </div>
          <div style={{ fontSize: '48px', fontFamily: 'Georgia, serif', fontWeight: 400, color: '#1A1A1A', lineHeight: 1 }}>
            ₹{Number(total).toLocaleString('en-IN')}
          </div>
          <div style={{
            fontSize: '13px', color: '#4A4A4A', marginTop: '8px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div style={{
        textAlign: 'center', padding: '0 0 32px',
        fontSize: '11px', color: '#6B6B6B',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        Confidential — for internal use only
      </div>
    </div>
  )
}

function SummaryPage({ expenses, reportData }) {
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const flaggedCount = expenses.filter((_, i) => reportData.results?.[i]?.flags?.length > 0).length

  return (
    <div style={{
      width: '794px', minHeight: '1122px', background: '#FFFFFF',
      boxSizing: 'border-box', padding: '40px',
      pageBreakAfter: 'always',
    }}>
      <div style={{ fontSize: '20px', fontFamily: 'Georgia, serif', color: '#1A1A1A', marginBottom: '24px' }}>
        Expense Summary
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <thead>
          <tr style={{ background: '#F7F7F7' }}>
            {['No', 'Date', 'Vendor', 'Category', 'Amount', 'Status'].map((h, i) => (
              <th key={h} style={{
                textAlign: i === 4 ? 'right' : 'left',
                fontSize: '11px', fontWeight: 600, color: '#6B6B6B',
                padding: '10px 12px', borderBottom: '1px solid #E8E8E8',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp, i) => {
            const result = reportData.results?.[i]
            const hasViolation = result?.violations?.length > 0
            const hasFlag = result?.flags?.filter(f => !f.internalOnly).length > 0
            const statusLabel = hasViolation ? 'Issue' : hasFlag ? 'Flagged' : 'Passed'
            return (
              <tr key={exp.id} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#F7F7F7' }}>
                <td style={{ fontSize: '12px', color: '#1A1A1A', padding: '10px 12px', borderBottom: '1px solid #E8E8E8' }}>{i + 1}</td>
                <td style={{ fontSize: '12px', color: '#1A1A1A', padding: '10px 12px', borderBottom: '1px solid #E8E8E8' }}>{formatDate(exp.date)}</td>
                <td style={{ fontSize: '12px', color: '#1A1A1A', padding: '10px 12px', borderBottom: '1px solid #E8E8E8' }}>{truncate(exp.vendor, 20)}</td>
                <td style={{ fontSize: '12px', color: '#1A1A1A', padding: '10px 12px', borderBottom: '1px solid #E8E8E8' }}>{exp.category || '—'}</td>
                <td style={{ fontSize: '12px', color: '#1A1A1A', padding: '10px 12px', borderBottom: '1px solid #E8E8E8', textAlign: 'right' }}>
                  {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
                </td>
                <td style={{ fontSize: '12px', color: '#1A1A1A', padding: '10px 12px', borderBottom: '1px solid #E8E8E8' }}>{statusLabel}</td>
              </tr>
            )
          })}
          <tr style={{ background: '#1A1A1A' }}>
            <td colSpan={4} style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF', padding: '10px 12px' }}>Total</td>
            <td style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF', padding: '10px 12px', textAlign: 'right' }}>
              ₹{Number(total).toLocaleString('en-IN')}
            </td>
            <td style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF', padding: '10px 12px' }}>
              {expenses.length} expenses
            </td>
          </tr>
        </tbody>
      </table>

      {flaggedCount > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#CA8A04', marginBottom: '8px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            Notes
          </div>
          {expenses.map((exp, i) => {
            const result = reportData.results?.[i]
            const flags = result?.flags?.filter(f => !f.internalOnly) || []
            return flags.map((f, fi) => (
              <div key={`${i}-${fi}`} style={{
                fontSize: '12px', color: '#CA8A04', marginBottom: '4px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}>
                · {exp.vendor} — {f.message}
              </div>
            ))
          })}
        </div>
      )}
    </div>
  )
}

function ExpensePage({ expense, index, total, reportData, result }) {
  const hasViolation = result?.violations?.length > 0
  const hasFlag = result?.flags?.filter(f => !f.internalOnly).length > 0
  const statusPassed = !hasViolation && !hasFlag

  return (
    <div style={{
      width: '794px', minHeight: '1122px', background: '#FFFFFF',
      boxSizing: 'border-box', padding: '40px',
      pageBreakBefore: 'always',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginBottom: '16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ fontSize: '11px', color: '#6B6B6B' }}>
          Expense {index + 1} of {total}
        </div>
        <div style={{ fontSize: '11px', color: '#6B6B6B' }}>{reportData.reference}</div>
      </div>

      <div style={{ fontSize: '22px', fontFamily: 'Georgia, serif', color: '#1A1A1A', marginBottom: '4px' }}>
        {expense.vendor || 'Unknown vendor'}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 500, color: '#1A1A1A', marginBottom: '16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {expense.amount ? `₹${Number(expense.amount).toLocaleString('en-IN')}` : '—'}
      </div>

      <div style={{ height: '1px', background: '#E8E8E8', marginBottom: '20px' }} />

      <div style={{ display: 'flex', gap: '0', marginBottom: '16px' }}>
        <div style={{ width: '50%', paddingRight: '24px' }}>
          <PdfField label="Date" value={formatDate(expense.date)} />
          <PdfField label="Category" value={expense.category} />
          <PdfField label="Payment method" value={expense.payment_method} />
          <PdfField label="Invoice number" value={expense.invoice_number || 'Not provided'} />
          <PdfField label="GSTIN" value={expense.gstin || 'Not provided'} />
          <PdfField
            label="Who it was for"
            value={expense.expense_type === 'just_me' ? 'Just me' : expense.expense_type === 'team' ? 'Team' : expense.expense_type}
          />
        </div>
        <div style={{ width: '50%' }}>
          <PdfField label="Purpose" value={expense.purpose_type} />
          <PdfField label="Trip" value={expense.trip_name} />
          <PdfField
            label="Prior approval"
            value={expense.prior_approval_reference || (expense.prior_approval_taken ? 'Yes' : null)}
          />
          {expense.attendee_count > 1 && (
            <PdfField label="Attendees" value={String(expense.attendee_count)} />
          )}
          {expense.per_person_amount && (
            <PdfField label="Per person" value={`₹${Number(expense.per_person_amount).toLocaleString('en-IN')}`} />
          )}
        </div>
      </div>

      {expense.description && (
        <div style={{ marginBottom: '16px' }}>
          <PdfField label="Description" value={expense.description} />
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        {statusPassed ? (
          <div style={{
            fontSize: '12px', color: '#16A34A', background: '#F0FDF4',
            padding: '8px 12px', border: '1px solid #16A34A',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            Policy check passed
          </div>
        ) : hasFlag ? (
          <div style={{
            fontSize: '12px', color: '#CA8A04', background: '#FEFCE8',
            padding: '8px 12px', border: '1px solid #CA8A04',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            <div style={{ marginBottom: '4px' }}>Flagged for review</div>
            {result.flags.filter(f => !f.internalOnly).map((f, i) => (
              <div key={i} style={{ fontSize: '11px', marginTop: '2px' }}>· {f.message}</div>
            ))}
          </div>
        ) : null}
      </div>

      {(expense.receipt_url || expense.payment_url) && (
        <div>
          <div style={{
            fontSize: '11px', color: '#6B6B6B', fontWeight: 600, marginBottom: '12px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            Documents
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            {expense.receipt_url ? (
              <div>
                <img
                  src={expense.receipt_url}
                  alt="Receipt"
                  crossOrigin="anonymous"
                  style={{ maxWidth: '300px', maxHeight: '200px', objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block' }}
                  onError={e => {
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'flex'
                  }}
                />
                <div style={{ display: 'none', width: '200px', height: '120px', border: '1px solid #E8E8E8', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#6B6B6B', fontFamily: 'system-ui' }}>Document on file</span>
                </div>
                <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '4px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>Receipt</div>
              </div>
            ) : null}
            {expense.payment_url ? (
              <div>
                <img
                  src={expense.payment_url}
                  alt="Payment proof"
                  crossOrigin="anonymous"
                  style={{ maxWidth: '300px', maxHeight: '200px', objectFit: 'contain', border: '1px solid #E8E8E8', display: 'block' }}
                  onError={e => {
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'flex'
                  }}
                />
                <div style={{ display: 'none', width: '200px', height: '120px', border: '1px solid #E8E8E8', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#6B6B6B', fontFamily: 'system-ui' }}>Document on file</span>
                </div>
                <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '4px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>Payment proof</div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PDFTemplate({ expenses, reportData }) {
  if (!expenses || expenses.length === 0) return null

  return (
    <div
      id="pdf-template"
      style={{
        position: 'absolute', left: '-9999px', top: 0,
        width: '794px', background: '#FFFFFF',
      }}
    >
      <CoverPage expenses={expenses} reportData={reportData} />
      <SummaryPage expenses={expenses} reportData={reportData} />
      {expenses.map((exp, i) => (
        <ExpensePage
          key={exp.id}
          expense={exp}
          index={i}
          total={expenses.length}
          reportData={reportData}
          result={reportData.results?.[i]}
        />
      ))}
    </div>
  )
}
