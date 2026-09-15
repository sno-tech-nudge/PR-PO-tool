import { useState } from 'react'
import VendorStatusBadge from './VendorStatusBadge'
import { getDisplayName } from '../../lib/directory'

export default function PanDuplicateModal({ vendors, onAcknowledge, onClose, readOnly = false }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = vendors[activeIndex]

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface-card)', width: '100%', maxWidth: '480px', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--taupe-200)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>This PAN is already registered</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {vendors.length} other vendor{vendors.length !== 1 ? 's' : ''} already {vendors.length !== 1 ? 'use' : 'uses'} this PAN. You can still continue —
            duplicate PAN/GST registrations are allowed.
          </div>
        </div>

        {vendors.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', padding: '12px 20px 0', flexWrap: 'wrap' }}>
            {vendors.map((v, i) => (
              <div
                key={v.id}
                onClick={() => setActiveIndex(i)}
                style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer',
                  border: `1px solid ${i === activeIndex ? 'var(--action)' : 'var(--taupe-400)'}`,
                  background: i === activeIndex ? 'var(--action-bg)' : 'var(--surface-card)',
                  color: i === activeIndex ? 'var(--action)' : 'var(--ink)',
                }}
              >
                {v.org_name || `Vendor ${i + 1}`}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--taupe-100)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Organisation</span>
            <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600 }}>{active.org_name || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--taupe-100)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Vendor ID</span>
            <span style={{ fontSize: '13px', color: 'var(--ink)', fontFamily: 'monospace' }}>{active.vendor_id || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--taupe-100)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status</span>
            <VendorStatusBadge status={active.status} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Submitted By</span>
            <span style={{ fontSize: '13px', color: 'var(--ink)' }}>{getDisplayName(active.submitted_by) || '—'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--taupe-200)' }}>
          {readOnly ? (
            <button
              onClick={onClose}
              style={{
                height: '42px', padding: '0 20px',
                background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-md)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onAcknowledge}
                style={{
                  height: '42px', padding: '0 20px',
                  background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-md)',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Continue Anyway
              </button>
              <button
                onClick={onClose}
                style={{
                  height: '42px', padding: '0 20px',
                  background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-md)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Go Back and Edit PAN
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
