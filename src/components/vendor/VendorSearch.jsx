import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import VendorStatusBadge from './VendorStatusBadge'

export default function VendorSearch({ onCreateNew, onSelectExisting }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch() {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setSearched(true)
    const { data } = await supabase
      .from('vendors')
      .select('id, vendor_id, org_name, pan_number, email, phone, status, submitted_by')
      .or(`org_name.ilike.%${q}%,pan_number.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8)
    setResults(data || [])
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: '0 0 4px' }}>Add a Vendor</h2>
        <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
          First, search to check if this vendor already exists.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search by organisation name, PAN, email or phone"
          style={{
            flex: 1, height: '40px', border: '1px solid #D1D5DB', borderRadius: '4px',
            padding: '0 12px', fontSize: '14px', outline: 'none', color: '#1A1F36',
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            height: '40px', padding: '0 20px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {searched && (
        <div style={{ marginBottom: '16px' }}>
          {results.length === 0 ? (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '4px', padding: '14px 16px', fontSize: '13px', color: '#15803D' }}>
              No existing vendor found. You can proceed to create a new one.
            </div>
          ) : (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '4px', padding: '14px 16px', marginBottom: '12px', fontSize: '13px', color: '#92400E' }}>
              We found {results.length} existing vendor{results.length !== 1 ? 's' : ''}. Is this the vendor you meant?
            </div>
          )}

          {results.map(v => (
            <div
              key={v.id}
              style={{
                background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '4px',
                padding: '14px 16px', marginBottom: '8px', cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onClick={() => onSelectExisting(v)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1A1F36', marginBottom: '4px' }}>{v.org_name}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    PAN: {v.pan_number} &nbsp;·&nbsp; {v.email} &nbsp;·&nbsp; {v.phone}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '3px', fontFamily: 'monospace' }}>{v.vendor_id}</div>
                </div>
                <VendorStatusBadge status={v.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <button
          onClick={onCreateNew}
          style={{
            height: '40px', padding: '0 24px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Create New Vendor
        </button>
        {!searched && (
          <span style={{ fontSize: '12px', color: '#9CA3AF', alignSelf: 'center' }}>
            Search first to avoid duplicates
          </span>
        )}
      </div>
    </div>
  )
}
