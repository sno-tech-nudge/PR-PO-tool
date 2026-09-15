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

// Human label for a PR's current position in its approval chain, derived
// from its pr_approvals rows — same idea as the reference "Current State"
// column, without introducing a new approval level.
function currentStageLabel(pr) {
  const approvals = pr.pr_approvals || []
  if (pr.status === 'rejected') {
    const rejectedAt = approvals.find(a => a.status === 'rejected')
    return `Rejected${rejectedAt ? ` by ${rejectedAt.approver_name}` : ''}`
  }
  if (pr.status === 'po_generated') return 'PO Issued'
  if (pr.status === 'approved') return 'Approved'
  const approved = approvals.filter(a => a.status === 'approved')
  const pending = approvals.find(a => a.status === 'pending')
  if (!pending) return 'Submitted'
  if (approved.length === 0) return `Pending — ${pending.approver_name}`
  return `Approved by ${approved.map(a => a.approver_name).join(', ')}, pending ${pending.approver_name}`
}

// Approve/reject only happens in the detail view (PRDetail.jsx) — same
// convention as expense reports (ApproverDashboard.jsx's cards are pure
// navigation too). This card is informational + a link, nothing more.
function PRCard({ pr, onClick }) {
  const hoursAgo = Math.floor((Date.now() - new Date(pr.submitted_at || pr.created_at).getTime()) / 3600000)
  const isOverdue = hoursAgo >= 48
  const isWarning = hoursAgo >= 24 && !isOverdue

  return (
    <div
      onClick={() => onClick(pr.id)}
      style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '10px', cursor: 'pointer', overflow: 'hidden', background: 'var(--surface-card)' }}
    >
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{pr.vendors?.org_name || 'Unknown Vendor'}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>INR {Number(pr.amount || 0).toLocaleString('en-IN')}</div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{pr.purpose?.substring(0, 70)}{pr.purpose?.length > 70 ? '…' : ''}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ fontFamily: 'monospace' }}>{pr.pr_number}</span> · {getDisplayName(pr.requested_by)} · {timeAgo(pr.submitted_at)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--taupe-100)', padding: '2px 8px', borderRadius: 'var(--radius-xs)' }}>
            {pr.category}
          </div>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--action)', marginTop: '6px' }}>
          {currentStageLabel(pr)}
        </div>
      </div>
      {isOverdue && (
        <div style={{ padding: '5px 16px', background: 'var(--clay-bg)', borderTop: '1px solid var(--clay-text)', fontSize: '11px', color: 'var(--clay-text)' }}>
          Overdue — pending {hoursAgo}h
        </div>
      )}
      {isWarning && (
        <div style={{ padding: '5px 16px', background: 'var(--gold-bg)', borderTop: '1px solid var(--gold-text)', fontSize: '11px', color: 'var(--gold-text)' }}>
          Pending {hoursAgo}h — please review
        </div>
      )}
    </div>
  )
}

export default function PRApproverDashboard({ onViewPR, onBack }) {
  const [tab, setTab]         = useState('pending')
  const [pending, setPending] = useState([])
  const [reviewed, setReviewed] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    load()
    // New PRs (or approvals actioned by someone else) should show up without
    // the approver needing to navigate away and back — poll like
    // NotificationBell does, silently so the list doesn't flash "Loading…"
    // every cycle.
    const interval = setInterval(() => load({ silent: true }), 15000)
    return () => clearInterval(interval)
  }, [])

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    const cols = '*, vendors(*), pr_approvals(*)'
    const [{ data: pend }, { data: rev }] = await Promise.all([
      supabase
        .from('purchase_requests')
        .select(cols)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('purchase_requests')
        .select(cols)
        .in('status', ['approved', 'rejected', 'po_generated'])
        .order('submitted_at', { ascending: false })
        .limit(20),
    ])
    setPending(pend || [])
    setReviewed(rev || [])
    setLoading(false)
  }

  const list = tab === 'pending' ? pending : reviewed
  const filtered = search.trim()
    ? list.filter(pr => {
        const q = search.trim().toLowerCase()
        return (
          pr.pr_number?.toLowerCase().includes(q) ||
          pr.vendors?.org_name?.toLowerCase().includes(q) ||
          pr.requested_by?.toLowerCase().includes(q) ||
          pr.category?.toLowerCase().includes(q)
        )
      })
    : list

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {onBack && (
          <div onClick={onBack} style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
            Back
          </div>
        )}
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Purchase Requests</div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)' }}>Pending your review</div>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search PR number, vendor, requester…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', height: '36px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: '13px', color: 'var(--ink)', outline: 'none', background: 'var(--taupe-50)', boxSizing: 'border-box', marginBottom: '16px' }}
      />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--taupe-200)', marginBottom: '16px' }}>
        {[
          { key: 'pending',  label: `Pending (${pending.length})` },
          { key: 'reviewed', label: `Reviewed (${reviewed.length})` },
        ].map(t => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px', fontSize: '13px', cursor: 'pointer',
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

      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
          {list.length === 0
            ? (tab === 'pending' ? 'No purchase requests pending review.' : 'No reviewed requests.')
            : 'No requests match your search.'}
        </div>
      )}

      {!loading && filtered.map(pr => (
        <PRCard key={pr.id} pr={pr} onClick={onViewPR} />
      ))}
    </div>
  )
}
