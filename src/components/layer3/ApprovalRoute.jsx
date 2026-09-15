const ROUTE_STEPS = {
  reporting_manager: ['You', 'Reporting Manager'],
  manager_and_fl: ['You', 'Reporting Manager', 'Functional Lead'],
  manager_fl_coo: ['You', 'Reporting Manager', 'Functional Lead', 'COO'],
}

export default function ApprovalRoute({ route }) {
  if (!route) return null
  const steps = ROUTE_STEPS[route.route] || ROUTE_STEPS.reporting_manager

  return (
    <div style={{
      border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)',
      background: 'var(--taupe-50)', padding: '14px 16px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
        Approval route
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap', rowGap: '8px' }}>
        {steps.map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              fontSize: '12px', fontWeight: i === 0 ? 400 : 500,
              color: i === 0 ? 'var(--text-muted)' : 'var(--text)',
              background: i === 0 ? 'var(--taupe-100)' : 'var(--surface-card)',
              border: `1px solid ${i === 0 ? 'var(--taupe-200)' : 'var(--taupe-400)'}`,
              borderRadius: '20px', padding: '4px 10px',
            }}>
              {step}
            </div>
            {i < steps.length - 1 && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 4px' }}>→</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: '1.5' }}>
        {route.message}
      </div>
    </div>
  )
}
