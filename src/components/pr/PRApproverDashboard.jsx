import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

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
      style={{ border: '1px solid #E8E8E8', borderRadius: '4px', marginBottom: '10px', cursor: 'pointer', overflow: 'hidden', background: '#FFFFFF' }}
    >
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{pr.vendors?.org_name || 'Unknown Vendor'}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A' }}>INR {Number(pr.amount || 0).toLocaleString('en-IN')}</div>
        </div>
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>{pr.purpose?.substring(0, 70)}{pr.purpose?.length > 70 ? '…' : ''}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
            <span style={{ fontFamily: 'monospace' }}>{pr.pr_number}</span> · {pr.requested_by?.split('@')[0]} · {timeAgo(pr.submitted_at)}
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: '2px' }}>
            {pr.category}
          </div>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#8C3225', marginTop: '6px' }}>
          {currentStageLabel(pr)}
        </div>
      </div>
      {isOverdue && (
        <div style={{ padding: '5px 16px', background: '#FEF2F2', borderTop: '1px solid #DC2626', fontSize: '11px', color: '#DC2626' }}>
          Overdue — pending {hoursAgo}h
        </div>
      )}
      {isWarning && (
        <div style={{ padding: '5px 16px', background: '#FEFCE8', borderTop: '1px solid #CA8A04', fontSize: '11px', color: '#CA8A04' }}>
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

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const cols = '*, vendors(*), pr_approvals(*)'
    const [{ data: pend }, { data: rev }] = await Promise.all([
      supabase
        .from('purchase_requests')
        .select(cols)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true }),
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
          <div onClick={onBack} style={{ fontSize: '13px', color: '#4A4A4A', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
            Back
          </div>
        )}
        <div>
          <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>Purchase Requests</div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A' }}>Pending your review</div>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search PR number, vendor, requester…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', height: '36px', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '0 12px', fontSize: '13px', color: '#1A1F36', outline: 'none', background: '#F8F9FA', boxSizing: 'border-box', marginBottom: '16px' }}
      />

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8', marginBottom: '16px' }}>
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
              color: tab === t.key ? '#1A1A1A' : '#6B6B6B',
              borderBottom: tab === t.key ? '2px solid #8C3225' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {loading && <div style={{ fontSize: '13px', color: '#6B6B6B' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: '14px', color: '#4A4A4A', textAlign: 'center', padding: '40px 0' }}>
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
