import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getDisplayName } from '../../lib/directory'
import { timeAgo } from '../../lib/approvalEngine'

// Vendors waiting for approval, shown in the Approvals hub next to expense
// reports and purchase requests. Opening one goes to its vendor page, where
// the people allowed to approve vendors can approve or reject it.
export default function VendorApprovalsList({ onViewVendor }) {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('vendors')
        .select('id, vendor_id, org_name, org_type, pan_number, city, submitted_by, submitted_at, created_at')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
      if (!cancelled) { setVendors(data || []); setLoading(false) }
    }
    load()
    const t = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Approvals</div>
        <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)' }}>Vendors pending approval</div>
      </div>

      {loading && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</div>}
      {!loading && vendors.length === 0 && (
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No vendors pending approval</div>
      )}

      {vendors.map(v => (
        <div
          key={v.id}
          onClick={() => onViewVendor(v.id)}
          style={{ border: '1px solid var(--taupe-200)', marginBottom: '12px', cursor: 'pointer', padding: '16px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', minWidth: 0 }}>{v.org_name || 'Unnamed vendor'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(v.submitted_at || v.created_at)}</div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            {[v.org_type, v.city, v.pan_number].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{v.vendor_id || '—'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>By {v.submitted_by ? getDisplayName(v.submitted_by) : '—'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
