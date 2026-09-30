import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getDisplayName } from '../../lib/directory'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 1) return 'just now'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function AdvanceCard({ advance, onClick }) {
  const hoursAgo = Math.floor((Date.now() - new Date(advance.created_at).getTime()) / 3600000)
  const isOverdue = hoursAgo >= 48

  return (
    <div
      onClick={() => onClick(advance)}
      style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '10px', cursor: 'pointer', overflow: 'hidden', background: 'var(--surface-card)' }}
    >
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{getDisplayName(advance.requested_by)}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>₹{Number(advance.amount || 0).toLocaleString('en-IN')}</div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          {advance.description?.substring(0, 70)}{advance.description?.length > 70 ? '…' : ''}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {advance.entity} · {advance.program} · {timeAgo(advance.created_at)}
        </div>
      </div>
      {isOverdue && (
        <div style={{ padding: '5px 16px', background: 'var(--clay-bg)', borderTop: '1px solid var(--clay-text)', fontSize: '11px', color: 'var(--clay-text)' }}>
          Overdue — pending {hoursAgo}h
        </div>
      )}
    </div>
  )
}

export default function AdvanceApproverDashboard({ onViewAdvance }) {
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState([])
  const [reviewed, setReviewed] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    const interval = setInterval(() => load({ silent: true }), 15000)
    return () => clearInterval(interval)
  }, [])

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    const [{ data: pend }, { data: rev }] = await Promise.all([
      supabase.from('advances').select('*').eq('status', 'pending_approval').order('created_at', { ascending: false }),
      supabase.from('advances').select('*').in('status', ['approved', 'rejected', 'auto_rejected', 'recorded']).order('created_at', { ascending: false }).limit(20),
    ])
    setPending(pend || [])
    setReviewed(rev || [])
    setLoading(false)
  }

  const list = tab === 'pending' ? pending : reviewed

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Advances</div>
        <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)' }}>Pending your review</div>
      </div>

      <div className="tab-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--taupe-200)', marginBottom: '16px', gap: '4px' }}>
        {[
          { key: 'pending', label: `Pending (${pending.length})` },
          { key: 'reviewed', label: `Reviewed (${reviewed.length})` },
        ].map(t => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              fontWeight: tab === t.key ? 500 : 400,
              color: tab === t.key ? 'var(--text)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--action)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {loading && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>}

      {!loading && list.length === 0 && (
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          {tab === 'pending' ? 'No advances pending review.' : 'No reviewed advances.'}
        </div>
      )}

      {!loading && list.map(a => (
        <AdvanceCard key={a.id} advance={a} onClick={onViewAdvance} />
      ))}
    </div>
  )
}
