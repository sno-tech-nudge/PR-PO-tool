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
      border: '1px solid #E8E8E8', borderRadius: '8px',
      background: '#FAFAFA', padding: '14px 16px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
        Approval route
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap', rowGap: '8px' }}>
        {steps.map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              fontSize: '12px', fontWeight: i === 0 ? 400 : 500,
              color: i === 0 ? '#9CA3AF' : '#1A1A1A',
              background: i === 0 ? '#F3F4F6' : '#FFFFFF',
              border: `1px solid ${i === 0 ? '#E5E7EB' : '#D1D5DB'}`,
              borderRadius: '20px', padding: '4px 10px',
            }}>
              {step}
            </div>
            {i < steps.length - 1 && (
              <div style={{ fontSize: '11px', color: '#9CA3AF', margin: '0 4px' }}>→</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '10px', lineHeight: '1.5' }}>
        {route.message}
      </div>
    </div>
  )
}
