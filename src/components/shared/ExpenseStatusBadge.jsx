const STATUS_CONFIG = {
  saved:        { label: 'Saved',        color: '#374151', bg: '#F9FAFB' },
  submitted:    { label: 'Submitted',    color: '#B45309', bg: '#FFFBEB' },
  under_review: { label: 'Under Review', color: '#8C3225', bg: '#fdf0ed' },
  approved:     { label: 'Approved',     color: '#15803D', bg: '#F0FDF4' },
  rejected:     { label: 'Rejected',     color: '#B91C1C', bg: '#FEF2F2' },
  processing:   { label: 'Processing',   color: '#6D28D9', bg: '#F5F3FF' },
  reimbursed:   { label: 'Reimbursed',   color: '#15803D', bg: '#F0FDF4' },
}

// sourceStatus (when present) overrides the computed label — used for
// migrated/historical rows so the badge matches the real status the
// source system had, instead of our own internal workflow state (e.g.
// "reported", which just means "already bundled into a report" and isn't
// itself a meaningful approval status for something migrated in already
// closed out).
export default function StatusBadge({ status, sourceStatus }) {
  const sc = sourceStatus
    ? STATUS_CONFIG[sourceStatus.toLowerCase()] || { label: sourceStatus, color: '#15803D', bg: '#F0FDF4' }
    : STATUS_CONFIG[status] || { label: status, color: '#6B7280', bg: '#F9FAFB' }
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
      background: sc.bg, color: sc.color,
    }}>
      {sc.label}
    </span>
  )
}
