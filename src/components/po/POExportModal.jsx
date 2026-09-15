import { useState } from 'react'
import { PO_EXPORT_FIELDS } from '../../lib/exportUtils'

export default function POExportModal({ selectedKeys, onExport, onClose }) {
  const [keys, setKeys] = useState(selectedKeys)

  function toggle(key) {
    setKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function toggleAll() {
    setKeys(prev => prev.length === PO_EXPORT_FIELDS.length ? [] : PO_EXPORT_FIELDS.map(f => f.key))
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface-card)', width: '100%', maxWidth: '420px', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--taupe-200)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Export to CSV</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Choose which fields to include — covers the PO's own fields plus its linked purchase request's details.</div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span onClick={toggleAll} style={{ fontSize: '12px', color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}>
              {keys.length === PO_EXPORT_FIELDS.length ? 'Deselect all' : 'Select all'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{keys.length} of {PO_EXPORT_FIELDS.length} fields</span>
          </div>
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {PO_EXPORT_FIELDS.map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 2px', cursor: 'pointer', fontSize: '13px', color: 'var(--ink)' }}>
                <input type="checkbox" checked={keys.includes(f.key)} onChange={() => toggle(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--taupe-200)' }}>
          <button
            onClick={() => onExport(keys)}
            disabled={keys.length === 0}
            style={{
              height: '42px', padding: '0 20px',
              background: keys.length === 0 ? 'var(--text-muted)' : 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: '13px', fontWeight: 700, cursor: keys.length === 0 ? 'default' : 'pointer',
            }}
          >
            Export CSV
          </button>
          <button
            onClick={onClose}
            style={{
              height: '42px', padding: '0 20px',
              background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-md)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
