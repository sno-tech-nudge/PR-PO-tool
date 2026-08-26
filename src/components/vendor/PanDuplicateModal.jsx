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
        style={{ background: '#FFFFFF', width: '100%', maxWidth: '480px', borderRadius: '8px', overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #E3E8EF' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1F36' }}>This PAN is already registered</div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
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
                  padding: '5px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
                  border: `1px solid ${i === activeIndex ? '#8C3225' : '#D1D5DB'}`,
                  background: i === activeIndex ? '#fdf0ed' : '#FFFFFF',
                  color: i === activeIndex ? '#8C3225' : '#374151',
                }}
              >
                {v.org_name || `Vendor ${i + 1}`}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Organisation</span>
            <span style={{ fontSize: '13px', color: '#1A1F36', fontWeight: 600 }}>{active.org_name || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Vendor ID</span>
            <span style={{ fontSize: '13px', color: '#1A1F36', fontFamily: 'monospace' }}>{active.vendor_id || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Status</span>
            <VendorStatusBadge status={active.status} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Submitted By</span>
            <span style={{ fontSize: '13px', color: '#1A1F36' }}>{getDisplayName(active.submitted_by) || '—'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '16px 20px', borderTop: '1px solid #E3E8EF' }}>
          {readOnly ? (
            <button
              onClick={onClose}
              style={{
                height: '42px', padding: '0 20px',
                background: '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '6px',
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
                  background: '#8C3225', color: '#FFFFFF', border: 'none', borderRadius: '6px',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Continue Anyway
              </button>
              <button
                onClick={onClose}
                style={{
                  height: '42px', padding: '0 20px',
                  background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '6px',
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
