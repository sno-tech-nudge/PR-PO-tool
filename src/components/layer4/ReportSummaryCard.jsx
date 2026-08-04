const ROUTE_LABEL = {
  reporting_manager: 'Reporting Manager',
  manager_and_fl: 'Reporting Manager and Functional Lead',
  manager_fl_coo: 'Reporting Manager, Functional Lead and COO',
}

const PURPOSE_LABELS = {
  internal: 'Internal team work',
  field: 'Field programme or beneficiary visit',
  donor: 'Donor or client engagement',
  office: 'Office or admin',
}

function Row({ label, value, alt, valueStyle }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', minHeight: '44px',
      background: alt ? '#F7F7F7' : '#FFFFFF',
      borderBottom: '1px solid #E8E8E8',
    }}>
      <div style={{ fontSize: '12px', color: '#6B6B6B' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1A1A1A', textAlign: 'right', maxWidth: '55%', ...valueStyle }}>
        {value}
      </div>
    </div>
  )
}

export default function ReportSummaryCard({ reference, entity, period, expenseCount, total, approvalRoute, generatedAt, reportDetails }) {
  const purpose = reportDetails?.purpose_type ? (PURPOSE_LABELS[reportDetails.purpose_type] || reportDetails.purpose_type) : null
  const trip = reportDetails?.trip_related ? (reportDetails.trip_name || 'Yes — outstation') : null
  const people = reportDetails?.attendee_count > 1
    ? `${reportDetails.attendee_count} people${reportDetails.per_person_amount ? ` · ₹${Number(reportDetails.per_person_amount).toLocaleString('en-IN')} each` : ''}`
    : null

  return (
    <div style={{ border: '1px solid #E8E8E8', marginBottom: '20px', overflow: 'hidden' }}>
      <Row label="Reference" value={reference} alt={false} />
      <Row label="Entity" value={entity || '—'} alt={true} />
      <Row label="Period" value={period} alt={false} />
      <Row label="Expenses" value={`${expenseCount} item${expenseCount !== 1 ? 's' : ''}`} alt={true} />
      <Row
        label="Total amount"
        value={total ? `₹${Number(total).toLocaleString('en-IN')}` : '—'}
        valueStyle={{ fontSize: '15px', fontWeight: 600 }}
        alt={false}
      />
      {purpose && <Row label="Purpose" value={purpose} alt={true} />}
      {trip && <Row label="Trip" value={trip} alt={false} />}
      {people && <Row label="People" value={people} alt={true} />}
      <Row
        label="Approval required from"
        value={ROUTE_LABEL[approvalRoute?.route] || '—'}
        alt={false}
      />
      <Row label="Generated" value={generatedAt} alt={true} />
    </div>
  )
}
