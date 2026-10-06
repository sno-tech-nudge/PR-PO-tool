import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Shown at the top of a returned report while it is being edited, so the
// reason it came back is the first thing seen — not something to go hunting
// for. Renders nothing unless the report has a rejection reason and is back
// in draft (i.e. reopened for editing).
export default function RejectionBanner({ report }) {
  const [approver, setApprover] = useState(null)
  const show = !!report?.rejection_reason && report?.status === 'draft'
  const reportId = report?.id || report?.report_id

  useEffect(() => {
    if (!show || !reportId) return
    let cancelled = false
    supabase.from('report_approvals')
      .select('approver_name, actioned_at')
      .eq('report_id', reportId).eq('status', 'rejected')
      .order('actioned_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (!cancelled && data?.[0]) setApprover(data[0]) })
    return () => { cancelled = true }
  }, [show, reportId])

  if (!show) return null

  const when = approver?.actioned_at || report.rejected_at
  const whenText = when ? new Date(when).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <div style={{ border: '1px solid var(--clay-text)', background: 'var(--clay-bg)', padding: '14px 16px', marginBottom: '16px', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--clay-text)', marginBottom: '6px' }}>
        This report was returned for changes
      </div>
      <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.5, background: 'var(--surface-card)', border: '1px solid var(--clay-text)', padding: '10px 12px', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
        {report.rejection_reason}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
        Returned by {approver?.approver_name || 'your approver'}{whenText ? ` on ${whenText}` : ''}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text)' }}>
        Make the changes below, then preview and resubmit.
      </div>
    </div>
  )
}
