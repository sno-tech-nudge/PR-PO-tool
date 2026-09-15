import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/approvalEngine'

const STEPS = ['Submitted', 'Under Review', 'Approved', 'Processing', 'Reimbursed']

function Timeline() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', position: 'relative' }}>
      {STEPS.map((label, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
          {/* Connector line */}
          {i > 0 && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '50%',
              width: '100%',
              height: '2px',
              background: 'var(--moss)',
              zIndex: 0,
            }} />
          )}
          {/* Circle */}
          <div style={{
            width: '20px', height: '20px', borderRadius: '50%',
            background: 'var(--moss)',
            border: '2px solid var(--moss)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1, flexShrink: 0,
          }}>
            <div style={{
              width: '8px', height: '5px',
              borderLeft: '2px solid var(--surface-card)', borderBottom: '2px solid var(--surface-card)',
              transform: 'rotate(-45deg)', marginTop: '-2px',
            }} />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--moss)', marginTop: '6px', textAlign: 'center', fontWeight: 500 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}

function DateRow({ label, value, alt }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 16px', minHeight: '40px',
      background: alt ? 'var(--taupe-50)' : 'var(--surface-card)',
      borderBottom: '1px solid var(--taupe-200)',
    }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--text)' }}>{value || '—'}</div>
    </div>
  )
}

export default function ReimbursedConfirmation({ reportId, reportReference, onStartNew, onBack }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloadingPDF, setDownloadingPDF] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  useEffect(() => {
    async function load() {
      if (!reportId && !reportReference) { setLoading(false); return }

      let query = supabase.from('expense_reports').select('*')
      if (reportId) query = query.eq('id', reportId)
      else query = query.eq('report_reference', reportReference)

      const { data } = await query.single()
      setReport(data || null)
      setLoading(false)
    }
    load()
  }, [reportId, reportReference])

  async function handleDownloadPDF() {
    if (!report?.pdf_storage_path) {
      setPdfError('No PDF available for this report.')
      return
    }
    setDownloadingPDF(true)
    setPdfError(null)
    const { data, error } = await supabase.storage
      .from('expense-reports')
      .createSignedUrl(report.pdf_storage_path, 60)

    if (error || !data?.signedUrl) {
      setPdfError('Could not generate download link. Try again.')
      setDownloadingPDF(false)
      return
    }

    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = `${report.report_reference || 'expense-report'}.pdf`
    a.click()
    setDownloadingPDF(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      {onBack && (
        <div
          onClick={onBack}
          style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', marginBottom: '24px' }}
        >
          ← Back
        </div>
      )}

      {/* Confirmation header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'var(--moss-bg)', border: '2px solid var(--moss)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <div style={{
            width: '20px', height: '12px',
            borderLeft: '3px solid var(--moss)', borderBottom: '3px solid var(--moss)',
            transform: 'rotate(-45deg)', marginTop: '-4px',
          }} />
        </div>
        <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--moss)', marginBottom: '4px' }}>
          Reimbursed
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Your expenses have been reimbursed
        </div>
      </div>

      {/* Timeline */}
      <Timeline report={report} />

      {/* Report details */}
      {report && (
        <div style={{ border: '1px solid var(--taupe-200)', overflow: 'hidden', marginBottom: '20px' }}>
          <DateRow label="Reference" value={<span style={{ fontFamily: 'monospace' }}>{report.report_reference}</span>} alt={false} />
          <DateRow label="Total amount" value={`₹${Number(report.total_amount || 0).toLocaleString('en-IN')}`} alt={true} />
          <DateRow label="Submitted" value={report.created_at ? formatDateTime(report.created_at) : '—'} alt={false} />
          <DateRow label="Approved" value={report.approved_at ? formatDateTime(report.approved_at) : '—'} alt={true} />
          <DateRow label="Reimbursed" value={report.reimbursed_at ? formatDateTime(report.reimbursed_at) : '—'} alt={false} />
        </div>
      )}

      {/* PDF download */}
      {report?.pdf_storage_path && (
        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            style={{
              width: '100%', height: '44px',
              background: 'var(--surface-card)', color: 'var(--text)',
              border: '1px solid var(--action)',
              fontSize: '14px', cursor: downloadingPDF ? 'default' : 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {downloadingPDF ? 'Preparing download…' : 'Download PDF report'}
          </button>
          {pdfError && (
            <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginTop: '6px', textAlign: 'center' }}>
              {pdfError}
            </div>
          )}
        </div>
      )}

      {/* Start new */}
      <button
        onClick={onStartNew}
        style={{
          width: '100%', height: '48px',
          background: 'var(--action)', color: 'var(--surface-card)',
          border: 'none', fontSize: '14px', fontWeight: 500,
          cursor: 'pointer', borderRadius: 'var(--radius-sm)',
        }}
      >
        Start new expense
      </button>
    </div>
  )
}
