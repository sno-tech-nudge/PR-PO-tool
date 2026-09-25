import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { canCreatePR } from '../../lib/auth'
import PRStatusTimeline from './PRStatusTimeline'
import PRStatusModal from './PRStatusModal'

const STATUS_COLOR = {
  draft:        { color: 'var(--text-muted)', bg: 'var(--taupe-50)' },
  submitted:    { color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  approved:     { color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  po_generated: { color: 'var(--action)', bg: 'var(--action-bg)' },
  rejected:     { color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
}

export default function PRList({ user, onViewPR, onCreatePR, onResumeDraft }) {
  const [prs, setPRs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [statusPR, setStatusPR] = useState(null)
  const [deletingDraftId, setDeletingDraftId] = useState(null)

  useEffect(() => {
    load()
    // Status changes made by an approver elsewhere (FL/PR Approver/Finance)
    // should show up here without the requester needing to leave and come back.
    const interval = setInterval(() => load({ silent: true }), 15000)
    return () => clearInterval(interval)
  }, [])

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    const { data } = await supabase
      .from('purchase_requests')
      .select('id, pr_number, amount, category, entity, purpose, status, submitted_at, created_at, requested_by, rejection_reason, source, vendors(org_name)')
      .eq('requested_by', user.email)
      .order('created_at', { ascending: false })
    setPRs(data || [])
    setLoading(false)
  }

  // A draft only ever shows up here scoped to `requested_by = user.email`
  // (see the load() query above), so it's already this person's own — no
  // separate ownership check needed. A draft has no pr_approvals rows yet
  // (only created on submit), so a plain delete is safe with no orphans.
  async function handleDeleteDraft(pr) {
    if (!window.confirm(`Delete this draft PR${pr.vendors?.org_name ? ` for ${pr.vendors.org_name}` : ''}? This cannot be undone.`)) return
    setDeletingDraftId(pr.id)
    await supabase.from('purchase_requests').delete().eq('id', pr.id)
    setPRs(prev => prev.filter(p => p.id !== pr.id))
    setDeletingDraftId(null)
    setStatusPR(null)
  }

  const byFilter = filter === 'all' ? prs : prs.filter(p => p.status === filter)
  const filtered = search.trim()
    ? byFilter.filter(p => {
        const s = search.trim().toLowerCase()
        return (
          p.pr_number?.toLowerCase().includes(s) ||
          p.vendors?.org_name?.toLowerCase().includes(s) ||
          p.purpose?.toLowerCase().includes(s) ||
          p.category?.toLowerCase().includes(s)
        )
      })
    : byFilter

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Procurement</div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)' }}>My Requests</div>
        </div>
        {canCreatePR(user.role) && (
          <button
            onClick={onCreatePR}
            style={{ height: '36px', padding: '0 16px', background: 'var(--action)', color: 'var(--surface-card)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            + New PR
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Search by PR number, vendor, or purpose…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', height: '36px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
          padding: '0 12px', fontSize: '13px', color: 'var(--text)', outline: 'none',
          background: 'var(--surface-card)', boxSizing: 'border-box', marginBottom: '14px',
        }}
      />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--taupe-200)', marginBottom: '16px', gap: '0', overflowX: 'auto' }}>
        {[['all','All'],['submitted','Pending'],['approved','Approved'],['po_generated','PO Issued'],['rejected','Rejected'],['draft','Draft']].map(([key, label]) => {
          const count = key === 'all' ? prs.length : prs.filter(p => p.status === key).length
          return (
            <div
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '8px 14px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
                fontWeight: filter === key ? 600 : 400,
                color: filter === key ? 'var(--text)' : 'var(--text-muted)',
                borderBottom: filter === key ? '2px solid var(--action)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {label} {count > 0 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({count})</span>}
            </div>
          )
        })}
      </div>

      {loading && <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          {prs.length === 0
            ? 'No purchase requests yet.'
            : search.trim()
              ? 'No requests match your search.'
              : 'No requests match this filter.'}
        </div>
      )}

      {!loading && filtered.map(pr => {
        const sc = STATUS_COLOR[pr.status] || STATUS_COLOR.draft
        return (
          <div
            key={pr.id}
            onClick={() => pr.status === 'draft' ? onResumeDraft(pr.id) : onViewPR(pr.id)}
            style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '10px', padding: '14px 16px', cursor: 'pointer', background: 'var(--surface-card)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{pr.vendors?.org_name || 'Unknown Vendor'}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>INR {Number(pr.amount || 0).toLocaleString('en-IN')}</div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{pr.purpose?.substring(0, 80)}{pr.purpose?.length > 80 ? '…' : ''}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{pr.pr_number}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--radius-sm)', background: sc.bg, color: sc.color }}>
                  {pr.status === 'po_generated' ? 'PO Issued' : (pr.status || '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); setStatusPR(pr) }}
                  style={{
                    height: '24px', padding: '0 10px', background: 'var(--surface-card)', color: 'var(--action)',
                    border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  View Status
                </button>
              </div>
            </div>
            {pr.submitted_at && (
              <div style={{ marginTop: '8px' }}>
                <PRStatusTimeline status={pr.status} compact />
              </div>
            )}
          </div>
        )
      })}

      {statusPR && (
        <PRStatusModal
          pr={statusPR}
          onClose={() => setStatusPR(null)}
          onDelete={handleDeleteDraft}
          deleting={deletingDraftId === statusPR.id}
        />
      )}
    </div>
  )
}
