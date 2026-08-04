const SEVERITY_STYLES = {
  high: { bg: '#FFF7ED', border: '#FED7AA', dot: '#EA580C', text: '#9A3412', label: '#C2410C' },
  medium: { bg: '#FEFCE8', border: '#FDE68A', dot: '#CA8A04', text: '#78350F', label: '#92400E' },
  low: { bg: '#F0F9FF', border: '#BAE6FD', dot: '#0284C7', text: '#0C4A6E', label: '#075985' },
}

const RULE_LABELS = {
  late_flight: 'Late flight booking',
  handwritten_bill: 'Document quality',
  duplicate: 'Possible duplicate',
  near_threshold: 'Near approval threshold',
  open_advance: 'Open travel advance',
  non_reimbursable_soft: 'Possible non-reimbursable',
}

export default function PolicyFlag({ flag, expense }) {
  const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.low
  const label = RULE_LABELS[flag.rule] || 'Note'
  if (flag.internalOnly) return null

  return (
    <div style={{
      border: `1px solid ${s.border}`,
      borderRadius: '8px',
      background: s.bg,
      padding: '12px 14px',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: s.dot, flexShrink: 0, marginTop: '4px',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: s.label, marginBottom: '3px' }}>
            {label}
          </div>
          {expense && (
            <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>
              {expense.vendor || 'Unknown vendor'}{expense.amount ? ` · ₹${Number(expense.amount).toLocaleString('en-IN')}` : ''}
            </div>
          )}
          <div style={{ fontSize: '12px', color: s.text, lineHeight: '1.5' }}>
            {flag.message}
          </div>
        </div>
      </div>
    </div>
  )
}
