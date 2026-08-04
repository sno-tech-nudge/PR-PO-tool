import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VendorStatusBadge from './VendorStatusBadge'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function VendorList({ user, onViewVendor, onCreateVendor }) {
  const isFinance   = user.role === 'finance'
  const [vendors, setVendors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = supabase.from('vendors').select('id, vendor_id, org_name, org_type, city, state, status, submitted_by, submitted_at, approved_at')
    if (!isFinance) q = q.eq('submitted_by', user.email)
    q = q.order('submitted_at', { ascending: false })
    const { data } = await q
    setVendors(data || [])
    setLoading(false)
  }

  const filtered = vendors.filter(v => {
    if (filter !== 'all' && v.status !== filter) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return (v.org_name || '').toLowerCase().includes(s) || (v.vendor_id || '').toLowerCase().includes(s) || (v.city || '').toLowerCase().includes(s)
    }
    return true
  })

  const counts = { all: vendors.length, pending: vendors.filter(v => v.status === 'pending').length, approved: vendors.filter(v => v.status === 'approved').length, rejected: vendors.filter(v => v.status === 'rejected').length }

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8EF', padding: '0 28px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ padding: '14px 0 0', marginBottom: '2px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: 0, padding: '8px 0' }}>
              {isFinance ? 'Vendor Management' : 'My Vendors'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '0', marginTop: '4px' }}>
            {[['all','All'],['pending','Pending'],['approved','Approved'],['rejected','Rejected']].map(([key, label]) => (
              <div
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: '10px 18px', fontSize: '13px',
                  fontWeight: filter === key ? 600 : 400,
                  color: filter === key ? '#1565C0' : '#6B7280',
                  borderBottom: filter === key ? '2px solid #1565C0' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: '-1px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {label}
                {counts[key] > 0 && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: key === 'pending' && counts.pending > 0 ? '#DC2626' : '#E5E7EB',
                    color: key === 'pending' && counts.pending > 0 ? '#FFFFFF' : '#374151',
                    borderRadius: '10px', padding: '1px 6px',
                  }}>{counts[key]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
          <input
            type="text"
            placeholder="Search vendors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              height: '34px', border: '1px solid #E3E8EF', borderRadius: '3px',
              padding: '0 12px', fontSize: '13px', color: '#1A1F36', outline: 'none',
              background: '#FFFFFF', width: '280px',
            }}
          />
          <button
            onClick={onCreateVendor}
            style={{
              height: '34px', padding: '0 16px', background: '#8C3225', color: '#FFFFFF',
              border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add Vendor
          </button>
        </div>

        {loading && (
          <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '4px',
            padding: '48px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF',
          }}>
            {vendors.length === 0 ? 'No vendors yet. Add your first vendor to get started.' : 'No vendors match the current filter.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
                  {['Vendor ID', 'Organisation', 'Type', 'Location', 'Submitted By', 'Status', 'Date'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => (
                  <tr
                    key={v.id}
                    onClick={() => onViewVendor(v.id)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none', background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '11px 14px', fontSize: '11px', fontFamily: 'monospace', color: '#8C3225', fontWeight: 500 }}>{v.vendor_id}</td>
                    <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 500, color: '#1A1F36' }}>{v.org_name}</td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>{v.org_type}</td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#374151' }}>{[v.city, v.state].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: '11px', color: '#6B7280', fontFamily: 'monospace' }}>{v.submitted_by}</td>
                    <td style={{ padding: '11px 14px' }}><VendorStatusBadge status={v.status} /></td>
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{fmtDate(v.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #E3E8EF', fontSize: '11px', color: '#9CA3AF', background: '#F8F9FA' }}>
              {filtered.length} vendor{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
