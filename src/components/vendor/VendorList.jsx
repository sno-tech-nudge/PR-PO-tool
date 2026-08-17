import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import VendorStatusBadge from './VendorStatusBadge'
import VendorColumnPicker from './VendorColumnPicker'
import VendorExportModal from './VendorExportModal'
import PanDuplicateModal from './PanDuplicateModal'
import { downloadCSV, vendorsToRows } from '../../lib/exportUtils'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ALL_COLUMNS = [
  { key: 'vendor_id', label: 'Vendor ID' },
  { key: 'org_name', label: 'Organisation' },
  { key: 'org_type', label: 'Type' },
  { key: 'nature_of_business', label: 'Nature of Business' },
  { key: 'pan_number', label: 'PAN' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'location', label: 'Location' },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'submitted_by', label: 'Submitted By' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
]
const DEFAULT_VISIBLE_COLUMNS = ['vendor_id', 'org_name', 'org_type', 'location', 'submitted_by', 'status', 'created_at']
const DEFAULT_EXPORT_FIELDS = ['vendor_id', 'org_name', 'org_type', 'pan_number', 'location', 'submitted_by', 'status', 'submitted_at']

const COLUMNS_KEY = 'nudge_vendor_list_columns'
const EXPORT_KEY  = 'nudge_vendor_export_fields'

function loadColumns() {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return DEFAULT_VISIBLE_COLUMNS
}
function saveColumns(cols) { localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols)) }

function loadExportFields() {
  try {
    const raw = localStorage.getItem(EXPORT_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return DEFAULT_EXPORT_FIELDS
}
function saveExportFields(keys) { localStorage.setItem(EXPORT_KEY, JSON.stringify(keys)) }

function cellValue(v, key) {
  switch (key) {
    case 'location': return [v.city, v.state].filter(Boolean).join(', ') || '—'
    case 'status': return <VendorStatusBadge status={v.status} />
    case 'created_at': return fmtDate(v.created_at)
    default: return v[key] || '—'
  }
}

export default function VendorList({ user, onViewVendor, onCreateVendor, onResumeDraft }) {
  const isFinance   = user.role === 'finance'
  const [vendors, setVendors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [visibleColumns, setVisibleColumns] = useState(loadColumns)
  const [showExportModal, setShowExportModal] = useState(false)
  const [panPreview, setPanPreview] = useState(null) // { vendors } when viewing a PAN-duplicate pill

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = supabase.from('vendors').select(
      'id, vendor_id, org_name, org_type, nature_of_business, pan_number, gstin, aadhaar_number, ' +
      'city, state, contact_person, phone, email, bank_name, ifsc_code, status, submitted_by, ' +
      'submitted_at, approved_at, created_at'
    )
    if (!isFinance) q = q.eq('submitted_by', user.email)
    else q = q.neq('status', 'draft')
    q = q.order('created_at', { ascending: false })
    const { data } = await q
    setVendors(data || [])
    setLoading(false)
  }

  function handleColumnsChange(next) {
    setVisibleColumns(next)
    saveColumns(next)
  }

  function handleExport(fieldKeys) {
    saveExportFields(fieldKeys)
    setShowExportModal(false)
    const rows = vendorsToRows(filtered, fieldKeys)
    const date = new Date().toISOString().slice(0, 10)
    downloadCSV(rows, `nudge-vendors-${filter}-${date}.csv`)
  }

  // Duplicate-PAN visibility for Finance — computed from the already-loaded
  // list, no extra query. A duplicate is only ever a warning, never a block.
  const panCounts = useMemo(() => {
    const counts = {}
    for (const v of vendors) {
      if (!v.pan_number) continue
      counts[v.pan_number] = (counts[v.pan_number] || 0) + 1
    }
    return counts
  }, [vendors])

  const filtered = vendors.filter(v => {
    if (filter !== 'all' && v.status !== filter) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return (v.org_name || '').toLowerCase().includes(s) || (v.vendor_id || '').toLowerCase().includes(s) || (v.city || '').toLowerCase().includes(s)
    }
    return true
  })

  const counts = {
    all: vendors.length,
    pending: vendors.filter(v => v.status === 'pending').length,
    approved: vendors.filter(v => v.status === 'approved').length,
    rejected: vendors.filter(v => v.status === 'rejected').length,
    draft: vendors.filter(v => v.status === 'draft').length,
  }

  const tabs = [['all','All'],['pending','Pending'],['approved','Approved'],['rejected','Rejected']]
  if (!isFinance) tabs.push(['draft', 'Draft'])

  const columnsToShow = ALL_COLUMNS.filter(c => visibleColumns.includes(c.key))

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E3E8EF', padding: '0 28px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ padding: '14px 0 0', marginBottom: '2px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: 0, padding: '8px 0' }}>
              {isFinance ? 'Vendor Management' : 'My Vendors'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '0', marginTop: '4px' }}>
            {tabs.map(([key, label]) => (
              <div
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: '10px 18px', fontSize: '13px',
                  fontWeight: filter === key ? 600 : 400,
                  color: filter === key ? '#1565C0' : '#6B7280',
                  borderBottom: filter === key ? '2px solid #1565C0' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: '-1px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {label}
                {counts[key] > 0 && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: key === 'pending' && counts.pending > 0 ? '#DC2626' : '#E5E7EB',
                    color: key === 'pending' && counts.pending > 0 ? '#FFFFFF' : '#374151',
                    borderRadius: '10px', padding: '1px 6px',
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
            placeholder="Search vendors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              height: '34px', border: '1px solid #E3E8EF', borderRadius: '3px',
              padding: '0 12px', fontSize: '13px', color: '#1A1F36', outline: 'none',
              background: '#FFFFFF', width: '280px',
            }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            {isFinance && (
              <>
                <VendorColumnPicker allColumns={ALL_COLUMNS} visibleKeys={visibleColumns} onChange={handleColumnsChange} />
                <button
                  onClick={() => setShowExportModal(true)}
                  style={{
                    height: '34px', padding: '0 14px', background: '#FFFFFF', color: '#374151',
                    border: '1px solid #D1D5DB', borderRadius: '3px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Export CSV
                </button>
              </>
            )}
            <button
              onClick={onCreateVendor}
              style={{
                height: '34px', padding: '0 16px', background: '#8C3225', color: '#FFFFFF',
                border: 'none', borderRadius: '3px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Vendor
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '4px',
            padding: '48px 0', textAlign: 'center', fontSize: '13px', color: '#9CA3AF',
          }}>
            {vendors.length === 0 ? 'No vendors yet. Add your first vendor to get started.' : 'No vendors match the current filter.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E3E8EF' }}>
                    {columnsToShow.map(c => (
                      <th key={c.key} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: '#6B7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v, i) => {
                    const isDraft = v.status === 'draft'
                    const dupCount = v.pan_number ? (panCounts[v.pan_number] || 0) - 1 : 0
                    return (
                      <tr
                        key={v.id}
                        onClick={() => isDraft ? onResumeDraft(v.id) : onViewVendor(v.id)}
                        style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none', background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA', cursor: 'pointer' }}
                      >
                        {columnsToShow.map(c => (
                          <td key={c.key} style={{
                            padding: '11px 14px', fontSize: c.key === 'vendor_id' ? '11px' : '12px',
                            color: c.key === 'vendor_id' ? '#8C3225' : c.key === 'org_name' ? '#1A1F36' : '#374151',
                            fontWeight: c.key === 'vendor_id' || c.key === 'org_name' ? 500 : 400,
                            fontFamily: c.key === 'vendor_id' || c.key === 'submitted_by' ? 'monospace' : 'inherit',
                            whiteSpace: c.key === 'created_at' ? 'nowrap' : 'normal',
                          }}>
                            {cellValue(v, c.key)}
                            {c.key === 'org_name' && isFinance && dupCount > 0 && (
                              <span
                                onClick={e => { e.stopPropagation(); setPanPreview(vendors.filter(o => o.pan_number === v.pan_number && o.id !== v.id)) }}
                                style={{
                                  marginLeft: '8px', fontSize: '10px', fontWeight: 600, color: '#92400E',
                                  background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px',
                                  padding: '1px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                              >
                                ⚠ {dupCount} share{dupCount === 1 ? 's' : ''} this PAN
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #E3E8EF', fontSize: '11px', color: '#9CA3AF', background: '#F8F9FA' }}>
              {filtered.length} vendor{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {showExportModal && (
        <VendorExportModal
          selectedKeys={loadExportFields()}
          onExport={handleExport}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {panPreview && (
        <PanDuplicateModal
          vendors={panPreview}
          readOnly
          onClose={() => setPanPreview(null)}
        />
      )}
    </div>
  )
}
