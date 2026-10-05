import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { canAccessFinance } from '../../lib/auth'
import { downloadCSV, posToRows } from '../../lib/exportUtils'
import { attachPendingBalances } from '../../lib/poBalance'
import { fetchAllRows } from '../../lib/fetchAllRows'
import POExportModal from './POExportModal'
import SubmitPOExpense from './SubmitPOExpense'
import POStatusModal from './POStatusModal'

const EXPORT_KEY = 'nudge_po_export_fields'
const DEFAULT_EXPORT_FIELDS = ['po_number', 'status', 'entity', 'amount', 'generated_at', 'approved_at', 'pr_number', 'requested_by', 'purpose', 'category', 'vendor_org_name']

function loadExportFields() {
  try {
    const raw = localStorage.getItem(EXPORT_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return DEFAULT_EXPORT_FIELDS
}
function saveExportFields(keys) { localStorage.setItem(EXPORT_KEY, JSON.stringify(keys)) }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtAmt(n) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

const STATUS = {
  pending_approval: { label: 'Pending Approval', color: 'var(--gold-text)', bg: 'var(--gold-bg)' },
  issued:           { label: 'Issued',           color: 'var(--action)', bg: 'var(--action-bg)' },
  completed:        { label: 'Completed',        color: 'var(--moss-text)', bg: 'var(--moss-bg)' },
  cancelled:        { label: 'Cancelled',        color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
  rejected:         { label: 'Rejected',         color: 'var(--clay-text)', bg: 'var(--clay-bg)' },
}

const TABS = [
  ['all',              'All'],
  ['pending_approval', 'Pending Approval'],
  ['issued',           'Issued'],
  ['completed',        'Completed'],
  ['cancelled',        'Cancelled'],
  ['rejected',         'Rejected'],
]

export default function POList({ user, onViewPO }) {
  const [pos, setPOs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]     = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortOpen, setSortOpen] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [invoicePO, setInvoicePO] = useState(null)
  const [statusPO, setStatusPO] = useState(null)

  const isFinance = canAccessFinance(user.role)

  useEffect(() => {
    load()
    // This list never refreshed itself before — a Finance/PO-approver
    // sitting on this screen wouldn't see a freshly-submitted PO show up
    // under "Pending Approval" without manually leaving and coming back.
    // Same 15s interval as every other list/dashboard in this app.
    const interval = setInterval(() => load({ silent: true }), 15000)
    return () => clearInterval(interval)
  }, [])

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    const isEmployee = user.role === 'employee'
    // !inner turns the embedded relation into a real join filter — without
    // it, .eq('purchase_requests.requested_by', ...) only filters which
    // nested purchase_requests object comes back (leaving it null for a
    // non-match) while still returning the parent purchase_orders row, so
    // employees could see other people's POs with a blank PR card attached.
    // This table now runs well past Supabase's default 1000-row cap on a
    // single select() — page through with .range() instead of one
    // unbounded query, or the oldest POs silently stop showing up here.
    let data
    if (isEmployee) {
      data = await fetchAllRows((from, to) =>
        supabase
          .from('purchase_orders')
          .select('*, purchase_requests!inner(*), vendors(*)')
          .eq('purchase_requests.requested_by', user.email)
          .order('generated_at', { ascending: false })
          .range(from, to)
      )
    } else if (!isFinance) {
      // Everyone else who isn't Finance/Admin (fl, pr_approver, coo,
      // observer) doesn't approve POs themselves — only Finance does (see
      // PODetail.jsx's isPOApprover) — so they only need visibility into
      // what's still awaiting a decision (not the org's entire PO history;
      // the moment Finance acts, status leaves 'pending_approval' and the
      // PO drops out of this half on its own), PLUS any PO they themselves
      // raised in the past regardless of its current status — e.g. a
      // Functional Leader who has since changed roles, or whose historical
      // Zoho-migrated POs are mapped to their email. Two separate queries,
      // merged and de-duplicated, rather than one combined OR filter — a
      // combined filter mixing a top-level column with an embedded-table
      // column inside a single .or() is easy to get subtly wrong, and this
      // table is large enough that getting it wrong would leak real data.
      const [pending, own] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from('purchase_orders')
            .select('*, purchase_requests(*), vendors(*)')
            .eq('status', 'pending_approval')
            .order('generated_at', { ascending: false })
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase
            .from('purchase_orders')
            .select('*, purchase_requests!inner(*), vendors(*)')
            .eq('purchase_requests.requested_by', user.email)
            .order('generated_at', { ascending: false })
            .range(from, to)
        ),
      ])
      const seen = new Set()
      data = [...pending, ...own].filter(po => {
        if (!po || seen.has(po.id)) return false
        seen.add(po.id)
        return true
      })
    } else {
      data = await fetchAllRows((from, to) =>
        supabase
          .from('purchase_orders')
          .select('*, purchase_requests(*), vendors(*)')
          .order('generated_at', { ascending: false })
          .range(from, to)
      )
    }
    const clean = (data || []).filter(p => p != null)
    // Batched, not per-row — same helper the PO-picker dropdowns already use
    // (ExpenseDetails.jsx, ReportPreview.jsx) so "how much is left on this
    // PO" only ever has one computation, not a second copy of the math.
    const withPending = await attachPendingBalances(clean)
    setPOs(withPending)
    setLoading(false)
  }

  const filtered = pos.filter(p => {
    if (tab !== 'all' && p.status !== tab) return false
    if (search) {
      const s = search.toLowerCase()
      return (
        p.po_number?.toLowerCase().includes(s) ||
        p.vendors?.org_name?.toLowerCase().includes(s) ||
        p.entity?.toLowerCase().includes(s) ||
        p.purchase_requests?.pr_number?.toLowerCase().includes(s)
      )
    }
    return true
  })

  // Default keeps today's order (newest raised first); "pending" surfaces
  // the POs with the most money still outstanding — the ones someone's
  // most likely still waiting to be paid against — first. Only 'issued' POs
  // actually have a real upcoming payment (matches the Pending column's own
  // display rule below, which shows '—' for every other status) — without
  // this, a rejected/cancelled PO's leftover (never-to-be-paid) balance
  // could outrank a real pending payment on an issued PO.
  const pendingWeight = p => p.status === 'issued' ? (Number(p.pending) || 0) : -1
  const sorted = sortBy === 'pending'
    ? [...filtered].sort((a, b) => pendingWeight(b) - pendingWeight(a))
    : filtered

  const tabCount = (key) => key === 'all' ? pos.length : pos.filter(p => p.status === key).length

  function handleExport(fieldKeys) {
    saveExportFields(fieldKeys)
    setShowExportModal(false)
    const rows = posToRows(sorted, fieldKeys)
    const date = new Date().toISOString().slice(0, 10)
    downloadCSV(rows, `nudge-purchase-orders-${tab}-${date}.csv`)
  }

  return (
    <div style={{ padding: '28px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Procurement</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink)' }}>Purchase Orders</div>
        </div>
        {isFinance && (
          <button
            onClick={() => setShowExportModal(true)}
            style={{
              height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: 600,
              background: 'var(--surface-card)', color: 'var(--ink)', border: '1px solid var(--taupe-400)',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Tabs — single row, horizontal scroll only if needed (see .tab-scroll
          in src/index.css); never wraps or shows a vertical scrollbar. */}
      <div className="tab-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--taupe-200)', marginBottom: '16px', gap: '4px' }}>
        {TABS.map(([key, label]) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 16px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--ink)' : 'var(--text-muted)',
              borderBottom: tab === key ? '2px solid var(--action)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label}
            <span style={{
              marginLeft: '6px', fontSize: '11px', fontWeight: 500,
              color: tab === key ? 'var(--action)' : 'var(--text-muted)',
            }}>
              {tabCount(key)}
            </span>
          </div>
        ))}
      </div>

      {/* Search + sort — kept inline and compact, not a separate filter panel */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by PO number, vendor, entity…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '320px', height: '34px', border: '1px solid var(--taupe-200)',
            borderRadius: 'var(--radius-md)', padding: '0 12px', fontSize: '13px',
            outline: 'none', boxSizing: 'border-box', color: 'var(--ink)',
          }}
        />
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSortOpen(o => !o)}
            title="Sort"
            aria-label="Sort"
            style={{
              width: '34px', height: '34px', flexShrink: 0, padding: 0,
              border: `1px solid ${sortBy !== 'date' ? 'var(--action)' : 'var(--taupe-200)'}`,
              borderRadius: 'var(--radius-md)', background: 'var(--surface-card)',
              color: sortBy !== 'date' ? 'var(--action)' : 'var(--ink)',
              fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              // Sits above the backdrop below once open — without this the
              // backdrop (z-index 90, fixed inset:0) exactly overlaps this
              // button's own screen position and a second click meant to
              // close the popover can land ambiguously and fail (same bug
              // fixed in InfoTip.jsx).
              position: 'relative', zIndex: 95,
            }}
          >
            ⇅
          </button>

          {sortOpen && (
            <>
              <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
              <div style={{
                position: 'absolute', top: '40px', left: 0, zIndex: 100,
                background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 16px rgba(54, 32, 26,0.12)', width: '220px', padding: '6px',
              }}>
                {[['date', 'Newest first'], ['pending', 'Pending amount (highest)']].map(([key, label]) => (
                  <div
                    key={key}
                    onClick={() => { setSortBy(key); setSortOpen(false) }}
                    style={{
                      padding: '8px 10px', fontSize: '13px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      color: sortBy === key ? 'var(--action)' : 'var(--ink)', fontWeight: sortBy === key ? 600 : 400,
                      background: sortBy === key ? 'var(--action-bg)' : 'transparent',
                    }}
                  >
                    {sortBy === key ? '✓ ' : ''}{label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          {search ? 'No purchase orders match your search.' : 'No purchase orders yet.'}
        </div>
      ) : (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                  {['PO Number', 'Vendor', 'Linked PR', 'Entity', 'Amount', 'Pending', 'Date', 'Status', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((po, i) => {
                  const st = STATUS[po.status] || STATUS.issued
                  return (
                    <tr
                      key={po.id}
                      style={{
                        borderBottom: i < sorted.length - 1 ? '1px solid var(--taupe-100)' : 'none',
                        background: 'var(--surface-card)',
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--action)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {po.po_number}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--ink)', maxWidth: '160px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {po.vendors?.org_name || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {po.purchase_requests?.pr_number || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                        {po.entity || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtAmt(po.amount)}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {po.status === 'issued' && po.pending > 0 && po.purchase_requests?.requested_by === user.email ? (
                          <button
                            onClick={() => setInvoicePO(po)}
                            title="Attach an invoice against this PO's pending balance"
                            style={{
                              padding: '3px 10px', fontSize: '13px', fontWeight: 600,
                              background: 'var(--gold-bg)', color: 'var(--gold-text)',
                              border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                            }}
                          >
                            {fmtAmt(po.pending)}
                          </button>
                        ) : (
                          <span style={{
                            fontSize: '13px',
                            color: po.pending > 0 ? 'var(--gold-text)' : 'var(--moss-text)',
                          }}>
                            {po.status === 'issued' ? fmtAmt(po.pending) : '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(po.generated_at)}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                          fontSize: '11px', fontWeight: 600,
                          color: st.color, background: st.bg,
                        }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => setStatusPO(po)}
                            style={{
                              padding: '5px 12px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap',
                              background: 'transparent', border: '1px solid var(--taupe-200)',
                              borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--ink)',
                            }}
                          >
                            View Status
                          </button>
                          <button
                            onClick={() => onViewPO(po.id)}
                            style={{
                              padding: '5px 12px', fontSize: '12px', fontWeight: 500,
                              background: 'transparent', border: '1px solid var(--taupe-200)',
                              borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--ink)',
                            }}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showExportModal && (
        <POExportModal
          selectedKeys={loadExportFields()}
          onExport={handleExport}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Clicking a pending amount opens the same invoice-capture flow
          PODetail.jsx offers — the embedded purchase_requests(*)/vendors(*)
          join above already gives this row everything SubmitPOExpense needs,
          so no extra fetch is required to jump straight here from the list. */}
      {invoicePO && (
        <SubmitPOExpense
          po={invoicePO}
          pr={invoicePO.purchase_requests}
          vendor={invoicePO.vendors}
          user={user}
          pending={invoicePO.pending}
          onClose={() => setInvoicePO(null)}
          onSubmitted={async () => { setInvoicePO(null); await load() }}
        />
      )}

      {statusPO && (
        <POStatusModal
          po={statusPO}
          pr={statusPO.purchase_requests}
          vendor={statusPO.vendors}
          user={user}
          pending={statusPO.pending}
          totalSubmitted={(Number(statusPO.amount) || 0) - (Number(statusPO.pending) || 0)}
          onClose={() => setStatusPO(null)}
          onSubmitted={async () => { setStatusPO(null); await load() }}
        />
      )}
    </div>
  )
}
