const STATUS_CONFIG = {
  saved:        { label: 'Saved',        color: 'var(--ink)', bg: 'var(--taupe-50)' },
  submitted:    { label: 'Submitted',    color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  under_review: { label: 'Under Review', color: 'var(--action)', bg: 'var(--action-bg)' },
  approved:     { label: 'Approved',     color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  rejected:     { label: 'Rejected',     color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
  processing:   { label: 'Processing',   color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  reimbursed:   { label: 'Reimbursed',   color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
}

// sourceStatus (when present) overrides the computed label — used for
// migrated/historical rows so the badge matches the real status the
// source system had, instead of our own internal workflow state (e.g.
// "reported", which just means "already bundled into a report" and isn't
// itself a meaningful approval status for something migrated in already
// closed out).
export default function StatusBadge({ status, sourceStatus }) {
  const sc = sourceStatus
    ? STATUS_CONFIG[sourceStatus.toLowerCase()] || { label: sourceStatus, color: 'var(--moss-text)', bg: 'var(--moss-bg)' }
    : STATUS_CONFIG[status] || { label: status, color: 'var(--text-muted)', bg: 'var(--taupe-50)' }
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--radius-sm)',
      background: sc.bg, color: sc.color,
    }}>
      {sc.label}
    </span>
  )
}
