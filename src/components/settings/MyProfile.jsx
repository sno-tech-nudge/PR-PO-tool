import { getRoleLabel, canAccessFinance, canAccessApprovals, canApproveVendor, canCreatePR, isObserver } from '../../lib/auth'

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

function Row({ label, value }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '14px', color: '#1A1F36' }}>{value || '—'}</div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px' }}>
      {children}
    </div>
  )
}

// Read-only self-view: everyone (employee through admin) can see their own
// name/email/role here. There's no per-employee "reports to" in this app's
// model — approval routing is role-based, not manager-based — so this shows
// who currently holds each approval-chain role instead of a single manager,
// and a real permissions summary (derived from the same helpers the app
// itself gates on) in place of a policies list this app has no concept of.
export default function MyProfile({ user, members = [] }) {
  const byRole = role => members.filter(m => m.role === role).map(m => m.name).filter(Boolean)
  const flNames = byRole('fl')
  const prApproverNames = byRole('pr_approver')
  const financeNames = byRole('finance')

  const permissions = [
    { label: 'Raise Purchase Requests', on: canCreatePR(user.role) },
    { label: 'Approve at an assigned level (Functional Leader / PR Approver)', on: canAccessApprovals(user.role) && !isObserver(user.role) },
    { label: 'Approve vendor onboarding', on: canApproveVendor(user) },
    { label: 'Access Finance dashboard & approve Purchase Orders', on: canAccessFinance(user.role) },
    { label: 'Manage team members & roles', on: user.role === 'admin' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%', background: '#fdf0ed',
          color: '#8C3225', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', fontWeight: 700, flexShrink: 0,
        }}>
          {initials(user.name) || '?'}
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#1A1F36' }}>{user.name}</div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>{user.roleLabel || getRoleLabel(user.role)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <SectionLabel>Basic Information</SectionLabel>
          <Row label="Name" value={user.name} />
          <Row label="Email Address" value={user.email} />
        </div>

        <div style={{ flex: 1, minWidth: '240px' }}>
          <SectionLabel>Role & Approval Routing</SectionLabel>
          <Row label="Role" value={user.roleLabel || getRoleLabel(user.role)} />
          <Row label="Functional Leader(s)" value={flNames.join(', ')} />
          <Row label="PR Approver(s)" value={prApproverNames.join(', ')} />
          <Row label="PO Approver / Finance" value={financeNames.join(', ')} />
        </div>
      </div>

      <div style={{ marginTop: '12px', paddingTop: '24px', borderTop: '1px solid #E3E8EF' }}>
        <SectionLabel>Access & Permissions</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {permissions.map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <span style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                background: p.on ? '#F0FDF4' : '#F9FAFB', color: p.on ? '#15803D' : '#D1D5DB',
              }}>
                {p.on ? '✓' : '—'}
              </span>
              <span style={{ color: p.on ? '#1A1F36' : '#9CA3AF' }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
