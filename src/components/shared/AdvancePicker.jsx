import { money } from '../../lib/advanceBalance'

const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '')

// Pick one or more advances. Each row shows what is left on it, so it is clear
// when a spend needs more than one. Only advances with something left are listed.
export default function AdvancePicker({ advances, selected, onChange, spend }) {
  const open = advances.filter(a => a.remaining > 0)
  const toggle = id => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  const chosenLeft = open.filter(a => selected.includes(a.id)).reduce((s, a) => s + a.remaining, 0)

  if (!open.length) {
    return <div style={{ fontSize: '12px', color: 'var(--gold-text)', lineHeight: 1.5 }}>You have no advance with money left on it.</div>
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {open.map(a => {
          const on = selected.includes(a.id)
          return (
            <label key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', cursor: 'pointer', fontSize: '12px',
              border: `1.5px solid ${on ? 'var(--text)' : 'var(--taupe-200)'}`, background: on ? 'var(--taupe-50)' : 'var(--surface-card)', borderRadius: 'var(--radius-sm)',
            }}>
              <input type="checkbox" checked={on} onChange={() => toggle(a.id)} style={{ width: '15px', height: '15px', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{money(a.amount)} advance</span>
                <span style={{ color: 'var(--text-muted)' }}>{a.description ? ` · ${a.description}` : ''}{a.recorded_at ? ` · paid ${fmtDate(a.recorded_at)}` : ''}</span>
              </span>
              <strong style={{ color: 'var(--moss-text)', whiteSpace: 'nowrap' }}>{money(a.remaining)} left</strong>
            </label>
          )
        })}
      </div>
      {spend > 0 && selected.length > 0 && (
        <div style={{ fontSize: '12px', marginTop: '8px', lineHeight: 1.5, color: spend > chosenLeft ? 'var(--gold-text)' : 'var(--text-muted)' }}>
          {spend > chosenLeft
            ? `${money(spend)} is more than the ${money(chosenLeft)} left on the advance${selected.length > 1 ? 's' : ''} you picked. The rest will be reimbursed, or pick another advance.`
            : `${money(spend)} comes out of the advance${selected.length > 1 ? 's' : ''}, leaving ${money(chosenLeft - spend)}.`}
        </div>
      )}
    </div>
  )
}
