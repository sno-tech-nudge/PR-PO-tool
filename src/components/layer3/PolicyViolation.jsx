const FIX_INSTRUCTIONS = {
  submission_timing: 'Edit the expense date or ask your Finance Admin to override the submission window.',
  hotel_limit: 'Split the bill if possible, or request a pre-approved exception from your Functional Lead.',
  food_limit: 'Break the expense into per-meal entries, each under ₹750, or get prior approval for the excess.',
  documents_missing: 'Attach your boarding pass to this expense before submitting.',
  large_claim_no_donor: 'Edit the expense and add the donor name or programme reference in the description.',
  exclusion_category: 'This expense cannot be claimed under this policy. Remove it from the report.',
  per_km_rate: 'Edit the amount to match the approved per-km rate, or attach a pre-approved exception.',
  non_reimbursable: 'Remove the non-reimbursable item or submit a separate claim with supporting documentation.',
}

const RULE_LABELS = {
  submission_timing: 'Late submission',
  hotel_limit: 'Hotel limit exceeded',
  food_limit: 'Food limit exceeded',
  documents_missing: 'Missing documents',
  large_claim_no_donor: 'Donor reference missing',
  exclusion_category: 'Non-reimbursable category',
  per_km_rate: 'Per-km rate exceeded',
  non_reimbursable: 'Non-reimbursable item',
}

export default function PolicyViolation({ violation, expense }) {
  const label = RULE_LABELS[violation.rule] || 'Policy violation'
  const fix = FIX_INSTRUCTIONS[violation.rule] || 'Please review the policy and correct this expense.'

  return (
    <div style={{
      border: '1px solid #FECACA',
      borderRadius: '8px',
      background: '#FFF5F5',
      padding: '14px 16px',
      marginBottom: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: '#EF4444', color: '#FFFFFF',
          fontSize: '11px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: '1px',
        }}>!</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#B91C1C', marginBottom: '4px' }}>
            {label}
          </div>
          {expense && (
            <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '6px' }}>
              {expense.vendor || 'Unknown vendor'}{expense.amount ? ` · ₹${Number(expense.amount).toLocaleString('en-IN')}` : ''}
            </div>
          )}
          <div style={{ fontSize: '12px', color: '#7F1D1D', lineHeight: '1.5', marginBottom: '8px' }}>
            {violation.message}
          </div>
          <div style={{
            fontSize: '11px', color: '#92400E',
            background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: '4px', padding: '6px 10px', lineHeight: '1.5',
          }}>
            <span style={{ fontWeight: 600 }}>How to fix: </span>{fix}
          </div>
        </div>
      </div>
    </div>
  )
}
