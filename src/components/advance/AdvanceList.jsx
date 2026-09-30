import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { canAccessFinance } from '../../lib/auth'
import { getDisplayName } from '../../lib/directory'
import { sendAdvanceEmail } from '../../lib/advanceEmail'
import AdvanceStatusModal from './AdvanceStatusModal'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_BADGE = {
  pending_approval: { label: 'Pending Approval', color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  approved:         { label: 'Approved',         color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  recorded:         { label: 'Recorded',         color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  rejected:         { label: 'Rejected',         color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
  auto_rejected:    { label: 'Auto-Rejected',    color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
}

function StatusBadge({ status }) {
  const b = STATUS_BADGE[status] || { label: status, color: 'var(--text-muted)', bg: 'var(--taupe-100)' }
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, color: b.color, background: b.bg, borderRadius: 'var(--radius-lg)', padding: '3px 10px', whiteSpace: 'nowrap' }}>
      {b.label}
    </span>
  )
}

export default function AdvanceList({ user, onCreateAdvance }) {
  const isFinance = canAccessFinance(user.role)
  const [advances, setAdvances] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [statusAdvance, setStatusAdvance] = useState(null)
  const [recording, setRecording] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = supabase.from('advances').select('*')
    if (!isFinance) q = q.eq('requested_by', user.email)
    q = q.order('created_at', { ascending: false })
    const { data } = await q
    setAdvances(data || [])
    setLoading(false)
  }

  async function handleMarkDisbursed(advance) {
    setRecording(advance.id)
    const { error } = await supabase.from('advances').update({
      status: 'recorded', recorded_by: user.email, recorded_at: new Date().toISOString(),
    }).eq('id', advance.id)
    if (!error) {
      sendAdvanceEmail({ type: 'recorded', recipientEmail: advance.requested_by, amount: advance.amount, actorName: user.name || user.email })
      await load()
    }
    setRecording(null)
  }

  const filtered = advances.filter(a => {
    if (filter !== 'all' && a.status !== filter) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return (a.description || '').toLowerCase().includes(s) || (a.requested_by || '').toLowerCase().includes(s) || (a.entity || '').toLowerCase().includes(s)
    }
    return true
  })

  const counts = {
    all: advances.length,
    pending_approval: advances.filter(a => a.status === 'pending_approval').length,
    approved: advances.filter(a => a.status === 'approved').length,
    recorded: advances.filter(a => a.status === 'recorded').length,
    rejected: advances.filter(a => a.status === 'rejected' || a.status === 'auto_rejected').length,
  }

  const tabs = [['all', 'All'], ['pending_approval', 'Pending'], ['approved', 'Approved'], ['recorded', 'Recorded'], ['rejected', 'Rejected']]

  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--taupe-200)', padding: '0 28px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ padding: '14px 0 0', marginBottom: '2px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: 0, padding: '8px 0' }}>
              {isFinance ? 'Advances' : 'My Advances'}
            </h1>
          </div>
          <div className="tab-scroll" style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            {tabs.map(([key, label]) => (
              <div
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: '10px 18px', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0,
                  fontWeight: filter === key ? 600 : 400,
                  color: filter === key ? 'var(--action)' : 'var(--text-muted)',
                  borderBottom: filter === key ? '2px solid var(--action)' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: '-1px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {label}
                {counts[key] > 0 && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: key === 'pending_approval' && counts.pending_approval > 0 ? 'var(--clay-text)' : 'var(--taupe-200)',
                    color: key === 'pending_approval' && counts.pending_approval > 0 ? 'var(--surface-card)' : 'var(--ink)',
                    borderRadius: 'var(--radius-lg)', padding: '1px 6px',
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
            placeholder="Search advances…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
              padding: '0 12px', fontSize: '13px', color: 'var(--ink)', outline: 'none',
              background: 'var(--surface-card)', width: '280px',
            }}
          />
          <button
            onClick={onCreateAdvance}
            style={{
              height: '34px', padding: '0 16px', background: 'var(--action)', color: 'var(--surface-card)',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Request Advance
          </button>
        </div>

        {loading && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
            padding: '48px 0', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)',
          }}>
            {advances.length === 0 ? 'No advances yet. Request your first advance to get started.' : 'No advances match the current filter.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                    {(isFinance ? ['Employee'] : []).concat(['Description', 'Entity', 'Program', 'Expected Usage', 'Amount', 'Status']).map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                    <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => (
                    <tr
                      key={a.id}
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--taupe-100)' : 'none', background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)' }}
                    >
                      {isFinance && (
                        <td style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--ink)' }}>{getDisplayName(a.requested_by)}</td>
                      )}
                      <td style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--ink)', maxWidth: '220px' }}>
                        {a.description?.length > 60 ? `${a.description.slice(0, 60)}…` : a.description}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--ink)' }}>{a.entity}</td>
                      <td style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--ink)' }}>{a.program}</td>
                      <td style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtDate(a.expected_usage_date)}</td>
                      <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>₹{Number(a.amount).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '11px 14px' }}><StatusBadge status={a.status} /></td>
                      <td style={{ padding: '11px 14px', display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setStatusAdvance(a)}
                          style={{
                            height: '28px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--action)',
                            border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          View Status
                        </button>
                        {isFinance && a.status === 'approved' && (
                          <button
                            onClick={() => handleMarkDisbursed(a)}
                            disabled={recording === a.id}
                            style={{
                              height: '28px', padding: '0 12px', background: 'var(--moss-text)', color: 'var(--surface-card)',
                              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontWeight: 600,
                              cursor: recording === a.id ? 'default' : 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            {recording === a.id ? 'Marking…' : 'Mark as Disbursed'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--taupe-200)', fontSize: '11px', color: 'var(--text-muted)', background: 'var(--taupe-50)' }}>
              {filtered.length} advance{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {statusAdvance && (
        <AdvanceStatusModal advance={statusAdvance} onClose={() => setStatusAdvance(null)} />
      )}
    </div>
  )
}
