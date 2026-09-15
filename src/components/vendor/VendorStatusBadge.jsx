const CONFIGS = {
  draft:    { label: 'Draft',            color: 'var(--text-muted)', bg: 'var(--taupe-100)', border: 'var(--taupe-200)' },
  pending:  { label: 'Pending Approval', color: 'var(--gold-text)', bg: 'var(--gold-bg)', border: 'var(--gold-border)' },
  approved: { label: 'Approved',         color: 'var(--moss-text)', bg: 'var(--moss-bg)', border: 'var(--moss-border)' },
  rejected: { label: 'Rejected',         color: 'var(--clay-text)', bg: 'var(--clay-bg)', border: 'var(--clay-border)' },
}

export default function VendorStatusBadge({ status, size = 'sm' }) {
  const c = CONFIGS[status] || { label: status, color: 'var(--text-muted)', bg: 'var(--taupe-50)', border: 'var(--taupe-200)' }
  const fontSize = size === 'lg' ? '12px' : '10px'
  const padding  = size === 'lg' ? '4px 10px' : '2px 7px'
  return (
    <span style={{
      fontSize, fontWeight: 600, padding, borderRadius: 'var(--radius-sm)',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}
