import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { canAccessFinance } from '../../lib/auth'
import { downloadCSV, posToRows } from '../../lib/exportUtils'
import POExportModal from './POExportModal'

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
  pending_approval: { label: 'Pending Approval', color: '#B45309', bg: '#FFFBEB' },
  issued:           { label: 'Issued',           color: '#8C3225', bg: '#fdf0ed' },
  completed:        { label: 'Completed',        color: '#15803D', bg: '#F0FDF4' },
  cancelled:        { label: 'Cancelled',        color: '#B91C1C', bg: '#FEF2F2' },
  rejected:         { label: 'Rejected',         color: '#B91C1C', bg: '#FEF2F2' },
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
  const [showExportModal, setShowExportModal] = useState(false)

  const isFinance = canAccessFinance(user.role)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('purchase_orders')
      .select('*, purchase_requests(*), vendors(*)')
      .order('generated_at', { ascending: false })

    // Employees only see their own POs
    if (user.role === 'employee') {
      q = q.eq('purchase_requests.requested_by', user.email)
    }

    const { data } = await q
    setPOs((data || []).filter(p => p != null))
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

  const tabCount = (key) => key === 'all' ? pos.length : pos.filter(p => p.status === key).length

  function handleExport(fieldKeys) {
    saveExportFields(fieldKeys)
    setShowExportModal(false)
    const rows = posToRows(filtered, fieldKeys)
    const date = new Date().toISOString().slice(0, 10)
    downloadCSV(rows, `nudge-purchase-orders-${tab}-${date}.csv`)
  }

  return (
    <div style={{ padding: '28px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Procurement</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>Purchase Orders</div>
        </div>
        {isFinance && (
          <button
            onClick={() => setShowExportModal(true)}
            style={{
              height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: 600,
              background: '#FFFFFF', color: '#374151', border: '1px solid #D1D5DB',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: '16px', gap: 0 }}>
        {TABS.map(([key, label]) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 16px', fontSize: '13px', cursor: 'pointer',
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? '#111827' : '#6B7280',
              borderBottom: tab === key ? '2px solid #8C3225' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label}
            <span style={{
              marginLeft: '6px', fontSize: '11px', fontWeight: 500,
              color: tab === key ? '#1D4ED8' : '#9CA3AF',
            }}>
              {tabCount(key)}
            </span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search by PO number, vendor, entity…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '320px', height: '34px', border: '1px solid #E5E7EB',
            borderRadius: '6px', padding: '0 12px', fontSize: '13px',
            outline: 'none', boxSizing: 'border-box', color: '#111827',
          }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>
          {search ? 'No purchase orders match your search.' : 'No purchase orders yet.'}
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['PO Number', 'Vendor', 'Linked PR', 'Entity', 'Amount', 'Date', 'Status', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: '11px', fontWeight: 600, color: '#6B7280',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((po, i) => {
                  const st = STATUS[po.status] || STATUS.issued
                  return (
                    <tr
                      key={po.id}
                      style={{
                        borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                        background: '#FFFFFF',
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: '#8C3225', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {po.po_number}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#111827', maxWidth: '160px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {po.vendors?.org_name || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {po.purchase_requests?.pr_number || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }}>
                        {po.entity || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#111827', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtAmt(po.amount)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {fmtDate(po.generated_at)}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: '4px',
                          fontSize: '11px', fontWeight: 600,
                          color: st.color, background: st.bg,
                        }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          onClick={() => onViewPO(po.id)}
                          style={{
                            padding: '5px 12px', fontSize: '12px', fontWeight: 500,
                            background: 'transparent', border: '1px solid #E5E7EB',
                            borderRadius: '5px', cursor: 'pointer', color: '#374151',
                          }}
                        >
                          View
                        </button>
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
    </div>
  )
}
