// A small segmented switch between the views of one combined tab, such as
// Approvals and History, or Activity Log and System Logs. It sits above the
// view itself, so each view keeps its own page exactly as it was.
export default function ViewTabs({ items, value, onChange }) {
  return (
    <div style={{ padding: '10px 24px', background: 'var(--surface-card)', borderBottom: '1px solid var(--taupe-200)' }}>
      <div role="tablist" style={{ display: 'inline-flex', gap: '2px', padding: '3px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-md)' }}>
        {items.map(([key, label]) => {
          const active = value === key
          return (
            <button
              key={key} role="tab" aria-selected={active} type="button" onClick={() => onChange(key)}
              style={{
                height: '30px', padding: '0 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '13px', fontWeight: active ? 600 : 500, borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--surface-card)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--text-muted)',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
