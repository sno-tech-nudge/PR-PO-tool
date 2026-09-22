import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

export default function VendorSelector({ value, onChange }) {
  const [vendors, setVendors] = useState([])
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(true)
  const ref = useRef(null)

  useEffect(() => {
    supabase.from('vendors').select('id, vendor_id, org_name, org_type, contact_person, pan_number, beneficiary_name, bank_name').eq('status', 'approved').order('org_name').then(({ data }) => {
      setVendors(data || [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.trim()
    ? vendors.filter(v => (v.org_name || '').toLowerCase().includes(query.toLowerCase()) || (v.vendor_id || '').toLowerCase().includes(query.toLowerCase()) || (v.pan_number || '').toLowerCase().includes(query.toLowerCase()))
    : vendors

  const selected = vendors.find(v => v.id === value)

  function select(v) {
    onChange(v.id, v)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', minHeight: '40px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
          padding: '8px 12px', fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)',
          cursor: 'pointer', boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        {selected ? (
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{selected.org_name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{selected.vendor_id} · {selected.pan_number}</div>
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>{loading ? 'Loading approved vendors…' : 'Select approved vendor…'}</span>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface-card)', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
          boxShadow: '0 4px 12px rgba(54, 32, 26,0.12)', marginTop: '4px', maxHeight: '300px',
          overflow: 'auto',
        }}>
          <div style={{ padding: '8px' }}>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search vendors…"
              style={{
                width: '100%', height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
                padding: '0 10px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No approved vendors found
            </div>
          )}
          {filtered.map(v => (
            <div
              key={v.id}
              onClick={() => select(v)}
              style={{
                padding: '10px 12px', cursor: 'pointer', borderTop: '1px solid var(--taupe-100)',
                background: v.id === value ? 'var(--action-bg)' : 'var(--surface-card)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{v.org_name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {v.vendor_id} · {v.org_type} · {v.contact_person}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vendor card when selected */}
      {selected && (
        <div style={{ marginTop: '10px', background: 'var(--action-bg)', border: '1px solid var(--action-bg)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              ['Organisation', selected.org_name],
              ['PAN', selected.pan_number],
              ['Contact', selected.contact_person],
              ['Bank', selected.bank_name + (selected.beneficiary_name ? ' · ' + selected.beneficiary_name : '')],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: '10px', color: 'var(--action)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1px' }}>{label}</div>
                <div style={{ fontSize: '12px', color: 'var(--action)', fontWeight: 500 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
