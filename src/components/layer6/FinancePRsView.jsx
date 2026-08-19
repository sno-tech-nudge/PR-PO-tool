import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

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

function PRRow({ pr, onClick }) {
  return (
    <div
      onClick={() => onClick(pr.id)}
      style={{ border: '1px solid #E3E8EF', borderRadius: '4px', marginBottom: '10px', padding: '14px 16px', cursor: 'pointer', background: '#FFFFFF' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F36' }}>{pr.vendors?.org_name || 'Unknown Vendor'}</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1F36' }}>INR {Number(pr.amount || 0).toLocaleString('en-IN')}</div>
      </div>
      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>{pr.purpose?.substring(0, 90)}{pr.purpose?.length > 90 ? '…' : ''}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
          <span style={{ fontFamily: 'monospace' }}>{pr.pr_number}</span> · {pr.requested_by?.split('@')[0]} · {fmtDate(pr.submitted_at)}
        </div>
        <div style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: '2px' }}>
          {pr.category}
        </div>
      </div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#8C3225', marginTop: '6px' }}>
        {currentStageLabel(pr)}
      </div>
    </div>
  )
}

// System-wide PR view for the Finance Dashboard — unlike PRList.jsx (a
// requester's own PRs) or PRApproverDashboard.jsx (only what's pending
// review), this shows every PR across the org, split by where it sits in
// the lifecycle including a "Resubmitted" bucket (submitted again after a
// rejection — see PRForm.jsx's handleSubmit, which now keeps rejection_reason
// on resubmit instead of nulling it out, specifically so this filter works).
export default function FinancePRsView({ onViewPR }) {
  const [prs, setPRs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_requests')
      .select('*, vendors(org_name), pr_approvals(*)')
      .neq('status', 'draft')
      .order('submitted_at', { ascending: false })
    setPRs(data || [])
    setLoading(false)
  }

  const buckets = {
    pending: prs.filter(p => p.status === 'submitted' && !p.rejection_reason),
    resubmitted: prs.filter(p => p.status === 'submitted' && !!p.rejection_reason),
    approved: prs.filter(p => p.status === 'approved' || p.status === 'po_generated'),
    rejected: prs.filter(p => p.status === 'rejected'),
  }

  const tabs = [
    ['pending', 'Pending'],
    ['resubmitted', 'Resubmitted'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
  ]

  const list = buckets[tab] || []
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
    <div>
      <input
        type="text"
        placeholder="Search PR number, vendor, requester…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', height: '36px', border: '1px solid #E3E8EF', borderRadius: '4px', padding: '0 12px', fontSize: '13px', color: '#1A1F36', outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', marginBottom: '16px' }}
      />

      <div style={{ display: 'flex', borderBottom: '1px solid #E3E8EF', marginBottom: '16px', gap: '0' }}>
        {tabs.map(([key, label]) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 16px', fontSize: '13px', cursor: 'pointer',
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? '#1A1F36' : '#6B7280',
              borderBottom: tab === key ? '2px solid #8C3225' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label} {buckets[key].length > 0 && <span style={{ fontSize: '10px', color: '#9CA3AF' }}>({buckets[key].length})</span>}
          </div>
        ))}
      </div>

      {loading && <div style={{ fontSize: '13px', color: '#6B7280', textAlign: 'center', padding: '40px 0' }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '4px',
          padding: '48px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF',
        }}>
          No purchase requests in this bucket.
        </div>
      )}

      {!loading && filtered.map(pr => (
        <PRRow key={pr.id} pr={pr} onClick={onViewPR} />
      ))}
    </div>
  )
}
