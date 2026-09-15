import { useState, useEffect } from 'react'

export default function VendorColumnPicker({ allColumns, visibleKeys, onChange }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function toggle(key) {
    const next = visibleKeys.includes(key) ? visibleKeys.filter(k => k !== key) : [...visibleKeys, key]
    onChange(next)
  }

  function toggleAll() {
    onChange(visibleKeys.length === allColumns.length ? [] : allColumns.map(c => c.key))
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: '34px', padding: '0 14px', background: 'var(--surface-card)', color: 'var(--ink)',
          border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
        }}
      >
        Columns ▾
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', top: '40px', right: 0, zIndex: 100,
            background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(54, 32, 26,0.12)', width: '240px', padding: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span
                onClick={toggleAll}
                style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {visibleKeys.length === allColumns.length ? 'Deselect all' : 'Select all'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{visibleKeys.length} of {allColumns.length}</span>
            </div>
            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              {allColumns.map(col => (
                <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 2px', cursor: 'pointer', fontSize: '13px', color: 'var(--ink)' }}>
                  <input type="checkbox" checked={visibleKeys.includes(col.key)} onChange={() => toggle(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                marginTop: '10px', width: '100%', height: '32px', background: 'var(--action)', color: 'var(--surface-card)',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  )
}
