import { formatDateTime } from '../../lib/approvalEngine'
import { getDisplayName } from '../../lib/directory'

// Approval levels in the order they happen. Level rows are all created at
// submission, so their own timestamps tie; the level name decides the order.
function levelRank(a) {
  const m = String(a.approver_level || '').match(/level_(\d+)/)
  if (m) return Number(m[1])
  const k = String(a.approver_level || '').toLowerCase()
  if (k.includes('manager')) return 1
  if (k.includes('functional') || k === 'fl') return 2
  if (k.includes('finance')) return 3
  if (k.includes('coo')) return 4
  return 9
}

const TONE = {
  done:     { dot: 'var(--moss-text)', text: 'var(--moss-text)' },
  rejected: { dot: 'var(--clay-text)', text: 'var(--clay-text)' },
  pending:  { dot: 'var(--gold-text)', text: 'var(--gold-text)' },
  waiting:  { dot: 'var(--taupe-300)', text: 'var(--text-muted)' },
}

// Everything that has happened to the report, and what is still to come, in
// order: submitted, each approval level, approved, then reimbursement.
function buildJourney(report, approvals) {
  const steps = []
  const sorted = [...(approvals || [])].sort((a, b) => levelRank(a) - levelRank(b))
  const status = report?.status
  const rejected = status === 'rejected'

  steps.push({ key: 'submitted', state: 'done', title: 'Report submitted', when: report?.submitted_at || sorted[0]?.created_at || report?.created_at })

  let previousWhen = steps[0].when
  sorted.forEach(a => {
    const who = a.approver_email ? getDisplayName(a.approver_email) : null
    if (a.status === 'approved') {
      steps.push({ key: a.id || a.approver_level, state: 'done', title: `Approved by ${a.approver_name}`, sub: who, when: a.actioned_at })
      previousWhen = a.actioned_at || previousWhen
    } else if (a.status === 'rejected' || a.status === 'returned') {
      steps.push({ key: a.id || a.approver_level, state: 'rejected', title: `Returned by ${a.approver_name}`, sub: who, note: a.notes || report?.rejection_reason, when: a.actioned_at || report?.rejected_at })
    } else if (a.status === 'pending' && !rejected) {
      steps.push({ key: a.id || a.approver_level, state: 'pending', title: `Waiting for ${a.approver_name}`, sub: `Pending since ${formatDateTime(previousWhen)}`, due: a.due_at })
    } else if (!rejected) {
      steps.push({ key: a.id || a.approver_level, state: 'waiting', title: `Then ${a.approver_name}` })
    }
  })

  if (!rejected) {
    const approved = ['approved', 'processing', 'reimbursed'].includes(status)
    steps.push(approved
      ? { key: 'approved', state: 'done', title: 'Report approved', when: report?.approved_at }
      : { key: 'approved', state: 'waiting', title: 'Report approved' })
    if (status === 'reimbursed') steps.push({ key: 'reimbursed', state: 'done', title: 'Reimbursed', when: report?.reimbursed_at })
    else if (status === 'processing') steps.push({ key: 'reimbursed', state: 'pending', title: 'Finance is processing the reimbursement' })
    else steps.push({ key: 'reimbursed', state: 'waiting', title: 'Reimbursement' })
  }
  return steps
}

export default function ReportJourney({ report, approvals }) {
  const steps = buildJourney(report, approvals)
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '14px' }}>Where this report is</div>
      <div>
        {steps.map((st, i) => {
          const tone = TONE[st.state]
          const last = i === steps.length - 1
          return (
            <div key={st.key} style={{ display: 'flex', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '16px', flexShrink: 0 }}>
                <span
                  className={st.state === 'pending' ? 'status-blink' : undefined}
                  style={{
                    width: '14px', height: '14px', borderRadius: '50%', marginTop: '3px', flexShrink: 0, boxSizing: 'border-box',
                    background: st.state === 'waiting' ? 'var(--surface-card)' : tone.dot,
                    border: st.state === 'waiting' ? '2px solid var(--taupe-300)' : 'none',
                    color: 'var(--surface-card)', fontSize: '9px', fontWeight: 700, lineHeight: '14px', textAlign: 'center',
                  }}
                >
                  {st.state === 'done' ? '✓' : st.state === 'rejected' ? '✕' : ''}
                </span>
                {!last && <span style={{ flex: 1, width: '2px', background: st.state === 'done' ? 'var(--moss-border)' : 'var(--taupe-200)', margin: '3px 0' }} />}
              </div>
              <div style={{ paddingBottom: last ? 0 : '16px', minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: st.state === 'waiting' ? 400 : 600, color: tone.text }}>{st.title}</div>
                {st.sub && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>{st.sub}</div>}
                {st.when && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>{formatDateTime(st.when)}</div>}
                {st.due && <div style={{ fontSize: '11px', color: new Date(st.due) < new Date() ? 'var(--clay-text)' : 'var(--text-muted)', marginTop: '1px' }}>Due {formatDateTime(st.due)}</div>}
                {st.note && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginTop: '4px', lineHeight: 1.5 }}>{st.note}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// The status at a glance: amber and blinking while the report is still moving
// (with who it is waiting for), green once approved or reimbursed, red when it
// was returned.
export function ReportStatusPill({ report, approvals }) {
  const status = report?.status
  const waitingFor = [...(approvals || [])].sort((a, b) => levelRank(a) - levelRank(b)).find(a => a.status === 'pending')
  let label, tone, blink = false
  if (status === 'rejected') { label = 'Rejected'; tone = 'clay' }
  else if (status === 'reimbursed') { label = 'Reimbursed'; tone = 'moss' }
  else if (status === 'approved') { label = 'Approved'; tone = 'moss' }
  else if (status === 'processing') { label = 'Approved · reimbursement processing'; tone = 'gold'; blink = true }
  else if (status === 'draft') { label = 'Draft'; tone = 'taupe' }
  else { label = waitingFor ? `Pending · ${waitingFor.approver_name}` : 'Pending'; tone = 'gold'; blink = true }
  const colors = tone === 'taupe'
    ? { bg: 'var(--taupe-100)', border: 'var(--taupe-200)', text: 'var(--text-muted)', dot: 'var(--taupe-400)' }
    : { bg: `var(--${tone}-bg)`, border: `var(--${tone}-border)`, text: `var(--${tone}-text)`, dot: `var(--${tone}-text)` }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', borderRadius: 'var(--radius-sm)', background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, fontSize: '12px', fontWeight: 700 }}>
      <span className={blink ? 'status-blink' : undefined} style={{ width: '9px', height: '9px', borderRadius: '50%', background: colors.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}
