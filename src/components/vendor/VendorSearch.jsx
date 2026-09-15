import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import VendorStatusBadge from './VendorStatusBadge'

export default function VendorSearch({ onCreateNew, onSelectExisting, onBack }) {
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
      {onBack && (
        <div
          onClick={onBack}
          style={{ fontSize: '13px', color: 'var(--action)', cursor: 'pointer', marginBottom: '16px' }}
        >
          ← Back
        </div>
      )}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>Add a Vendor</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
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
            flex: 1, height: '40px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
            padding: '0 12px', fontSize: '14px', outline: 'none', color: 'var(--ink)',
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            height: '40px', padding: '0 20px', background: 'var(--action)', color: 'var(--surface-card)',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {searched && (
        <div style={{ marginBottom: '16px' }}>
          {results.length === 0 ? (
            <div style={{ background: 'var(--moss-bg)', border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', fontSize: '13px', color: 'var(--moss-text)' }}>
              No existing vendor found. You can proceed to create a new one.
            </div>
          ) : (
            <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: '12px', fontSize: '13px', color: 'var(--gold-text)' }}>
              We found {results.length} existing vendor{results.length !== 1 ? 's' : ''}. Is this the vendor you meant?
            </div>
          )}

          {results.map(v => (
            <div
              key={v.id}
              style={{
                background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
                padding: '14px 16px', marginBottom: '8px', cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onClick={() => onSelectExisting(v)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>{v.org_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    PAN: {v.pan_number} &nbsp;·&nbsp; {v.email} &nbsp;·&nbsp; {v.phone}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', fontFamily: 'monospace' }}>{v.vendor_id}</div>
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
            height: '40px', padding: '0 24px', background: 'var(--action)', color: 'var(--surface-card)',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Create New Vendor
        </button>
        {!searched && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center' }}>
            Search first to avoid duplicates
          </span>
        )}
      </div>

      {/* Fills the otherwise-empty space below the search box with a preview
          of what the form will ask for, so nothing about search above changes. */}
      <div style={{
        marginTop: '32px', background: 'var(--taupe-50)', border: '1px solid var(--taupe-200)',
        borderRadius: 'var(--radius-md)', padding: '18px 20px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
          What you'll need before you start
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
          {[
            'Organisation name, type and registered address',
            'PAN number and a copy of the PAN card',
            'Cancelled cheque or bank statement (beneficiary name, account number, IFSC)',
            'Registration certificate (varies by organisation type — HUF Deed, Partnership Deed, Certificate of Incorporation, etc.)',
            'Aadhaar number and copy — only for Individual/Freelancer or Proprietorship vendors',
            'GST certificate — only if GST-registered',
            'MSME certificate — only if MSME-registered',
            'Contact person, phone and email for the vendor',
          ].map(item => (
            <div key={item} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              <span style={{ color: 'var(--action)', flexShrink: 0 }}>○</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>
          Don't have everything yet? You can save the form as a draft and finish it later.
        </div>
      </div>
    </div>
  )
}
