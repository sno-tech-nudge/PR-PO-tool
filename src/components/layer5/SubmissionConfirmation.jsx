import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { downloadPDF } from '../../lib/pdfGenerator'
import { createApprovalRecords } from '../../lib/approvalEngine'
import StatusTimeline from './StatusTimeline'

const ROUTE_LABEL = {
  reporting_manager: 'Reporting Manager',
  manager_and_fl: 'Reporting Manager and Functional Lead',
  manager_fl_coo: 'Reporting Manager, Functional Lead and COO',
}

function InfoRow({ label, value, alt }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', minHeight: '44px',
      background: alt ? '#F7F7F7' : '#FFFFFF',
      borderBottom: '1px solid #E8E8E8',
    }}>
      <div style={{ fontSize: '12px', color: '#6B6B6B' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1A1A1A', textAlign: 'right', maxWidth: '55%' }}>
        {value || '—'}
      </div>
    </div>
  )
}

export default function SubmissionConfirmation({ submission, onStartNew, onTrackReport }) {
  const { reference, approvalRoute, expenseCount, total, pdf, pdfUploadPending } = submission || {}
  const [reportId, setReportId] = useState(null)
  const [submittedAt] = useState(new Date())
  const [timeLabel, setTimeLabel] = useState('just now')
  const [downloading, setDownloading] = useState(false)

  // Fetch reportId by reference and create approval records
  useEffect(() => {
    if (!reference) return
    async function init() {
      const { data } = await supabase
        .from('expense_reports')
        .select('id, created_at')
        .eq('report_reference', reference)
        .single()

      if (data) {
        setReportId(data.id)
        // Safe to call more than once (StrictMode double-invokes this effect in dev,
        // and a remount could too in prod) — createApprovalRecords upserts on the
        // (report_id, approver_level) unique constraint instead of a bare insert.
        await createApprovalRecords(data.id, total || 0, supabase)
      }
    }
    init()
  }, [reference])

  // Update "just now" label
  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - submittedAt.getTime()) / 60000)
      if (diff < 1) setTimeLabel('just now')
      else setTimeLabel(`${diff} minute${diff !== 1 ? 's' : ''} ago`)
    }, 30000)
    return () => clearInterval(timer)
  }, [submittedAt])

  function handleDownloadPDF() {
    if (!pdf) return
    setDownloading(true)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadPDF(pdf, `expense-report-${reference}-${dateStr}.pdf`)
    setTimeout(() => setDownloading(false), 1000)
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '8px' }}>Report Submitted</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '6px' }}>
        Your report is submitted
      </div>
      <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '20px', lineHeight: '1.5' }}>
        {ROUTE_LABEL[approvalRoute?.route] || 'Your approver'} has been notified and will review your report.
      </div>

      {/* Reference card */}
      <div style={{ border: '1px solid #E8E8E8', overflow: 'hidden', marginBottom: '20px' }}>
        <InfoRow label="Reference" value={<span style={{ fontFamily: 'monospace' }}>{reference}</span>} alt={false} />
        <InfoRow label="Total amount" value={total ? `₹${Number(total).toLocaleString('en-IN')}` : '—'} alt={true} />
        <InfoRow label="Expenses" value={expenseCount ? `${expenseCount} item${expenseCount !== 1 ? 's' : ''}` : '—'} alt={false} />
        <InfoRow label="Submitted to" value={ROUTE_LABEL[approvalRoute?.route] || '—'} alt={true} />
        <InfoRow label="Expected by" value="Next Friday if approved by Wednesday" alt={false} />
      </div>

      {pdfUploadPending && (
        <div style={{
          fontSize: '12px', color: '#CA8A04',
          background: '#FEFCE8', border: '1px solid #FDE68A',
          padding: '10px 14px', marginBottom: '16px', lineHeight: '1.5',
        }}>
          PDF upload is pending. It will retry automatically.
        </div>
      )}

      {/* Status timeline */}
      <div style={{ marginBottom: '8px' }}>
        <StatusTimeline currentStep={0} />
      </div>
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '24px' }}>
        Submitted {timeLabel}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          onClick={() => reportId && onTrackReport && onTrackReport(reportId)}
          disabled={!reportId}
          style={{
            width: '100%', height: '48px',
            background: '#FFFFFF',
            color: reportId ? '#1A1A1A' : '#9CA3AF',
            border: `1px solid ${reportId ? '#1A1A1A' : '#E8E8E8'}`,
            fontSize: '14px', fontWeight: 500,
            cursor: reportId ? 'pointer' : 'default',
            borderRadius: '4px',
          }}
        >
          Track this report
        </button>

        {pdf && (
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            style={{
              width: '100%', height: '48px',
              background: '#FFFFFF', color: '#1A1A1A',
              border: '1px solid #E8E8E8',
              fontSize: '14px', fontWeight: 500,
              cursor: downloading ? 'default' : 'pointer', borderRadius: '4px',
            }}
          >
            {downloading ? 'Downloading…' : 'Download PDF'}
          </button>
        )}

        <button
          onClick={onStartNew}
          style={{
            width: '100%', height: '48px',
            background: '#8C3225', color: '#FFFFFF',
            border: 'none', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', borderRadius: '4px',
          }}
        >
          Start new expense
        </button>
      </div>
    </div>
  )
}
