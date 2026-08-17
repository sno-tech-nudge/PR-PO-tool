const CONFIGS = {
  draft:    { label: 'Draft',            color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  pending:  { label: 'Pending Approval', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  approved: { label: 'Approved',         color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
  rejected: { label: 'Rejected',         color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
}

export default function VendorStatusBadge({ status, size = 'sm' }) {
  const c = CONFIGS[status] || { label: status, color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' }
  const fontSize = size === 'lg' ? '12px' : '10px'
  const padding  = size === 'lg' ? '4px 10px' : '2px 7px'
  return (
    <span style={{
      fontSize, fontWeight: 600, padding, borderRadius: '3px',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}
