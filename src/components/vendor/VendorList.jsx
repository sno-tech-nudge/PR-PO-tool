import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import VendorStatusBadge from './VendorStatusBadge'
import VendorColumnPicker from './VendorColumnPicker'
import VendorExportModal from './VendorExportModal'
import PanDuplicateModal from './PanDuplicateModal'
import VendorStatusModal from './VendorStatusModal'
import VendorInviteModal from './VendorInviteModal'
import { downloadCSV, vendorsToRows } from '../../lib/exportUtils'
import { canAccessFinance } from '../../lib/auth'
import { getDisplayName } from '../../lib/directory'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ALL_COLUMNS = [
  { key: 'vendor_id', label: 'Vendor ID' },
  { key: 'org_name', label: 'Organisation' },
  { key: 'org_type', label: 'Type' },
  { key: 'org_registration_number', label: 'Org Reg No.' },
  { key: 'nature_of_business', label: 'Nature of Business' },
  { key: 'pan_number', label: 'PAN' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'location', label: 'Location' },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'submitted_by', label: 'Submitted By' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Date' },
]
const DEFAULT_VISIBLE_COLUMNS = ['vendor_id', 'org_name', 'org_registration_number', 'location', 'submitted_by', 'status', 'created_at']
const DEFAULT_EXPORT_FIELDS = ['vendor_id', 'org_name', 'org_type', 'pan_number', 'location', 'submitted_by', 'status', 'submitted_at']

const COLUMNS_KEY = 'nudge_vendor_list_columns'
const EXPORT_KEY  = 'nudge_vendor_export_fields'

function loadColumns() {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY)
    if (raw) {
      const stored = JSON.parse(raw)
      // One-time migration for anyone who already customized columns before
      // "Type" was replaced with "Org Reg No." in the default view.
      return stored.includes('org_type') && !stored.includes('org_registration_number')
        ? stored.map(k => k === 'org_type' ? 'org_registration_number' : k)
        : stored
    }
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
    case 'submitted_by': return getDisplayName(v.submitted_by) || '—'
    default: return v[key] || '—'
  }
}

export default function VendorList({ user, onViewVendor, onCreateVendor, onResumeDraft }) {
  const isFinance   = canAccessFinance(user.role)
  const [vendors, setVendors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [visibleColumns, setVisibleColumns] = useState(loadColumns)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [panPreview, setPanPreview] = useState(null) // { vendors } when viewing a PAN-duplicate pill
  const [statusVendor, setStatusVendor] = useState(null) // vendor row when viewing the status timeline
  const [deletingDraftId, setDeletingDraftId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let q = supabase.from('vendors').select(
      'id, vendor_id, org_name, org_type, org_registration_number, nature_of_business, pan_number, gstin, aadhaar_number, ' +
      'is_msme, msme_details, ' +
      'city, state, contact_person, phone, email, bank_name, ifsc_code, status, submitted_by, source, ' +
      'submitted_at, approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at'
    )
    if (!isFinance) {
      q = q.eq('submitted_by', user.email)
    } else {
      // Finance sees every submitted vendor, but drafts are private scratch
      // work — a draft only shows up here if Finance is the one who saved it.
      q = q.or(`status.neq.draft,and(status.eq.draft,submitted_by.eq.${user.email})`)
    }
    q = q.order('created_at', { ascending: false })
    const { data } = await q
    setVendors(data || [])
    setLoading(false)
  }

  // A draft is only ever this person's own private scratch work (see the
  // `load()` query above), so no extra ownership check is needed here beyond
  // it being visible to them in the first place.
  async function handleDeleteDraft(vendor) {
    if (!window.confirm(`Delete this draft (${vendor.org_name || 'unnamed vendor'})? This cannot be undone.`)) return
    setDeletingDraftId(vendor.id)
    await supabase.from('vendors').delete().eq('id', vendor.id)
    setVendors(prev => prev.filter(v => v.id !== vendor.id))
    setDeletingDraftId(null)
    setStatusVendor(null)
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

  const tabs = [['all','All'],['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['draft','Draft']]

  const columnsToShow = ALL_COLUMNS.filter(c => visibleColumns.includes(c.key))

  return (
    <div style={{ background: 'var(--taupe-50)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-card)', borderBottom: '1px solid var(--taupe-200)', padding: '0 28px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ padding: '14px 0 0', marginBottom: '2px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: 0, padding: '8px 0' }}>
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
                    background: key === 'pending' && counts.pending > 0 ? 'var(--clay-text)' : 'var(--taupe-200)',
                    color: key === 'pending' && counts.pending > 0 ? 'var(--surface-card)' : 'var(--ink)',
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
            placeholder="Search vendors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              height: '34px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
              padding: '0 12px', fontSize: '13px', color: 'var(--ink)', outline: 'none',
              background: 'var(--surface-card)', width: '280px',
            }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            {isFinance && (
              <>
                <VendorColumnPicker allColumns={ALL_COLUMNS} visibleKeys={visibleColumns} onChange={handleColumnsChange} />
                <button
                  onClick={() => setShowExportModal(true)}
                  style={{
                    height: '34px', padding: '0 14px', background: 'var(--surface-card)', color: 'var(--ink)',
                    border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Export CSV
                </button>
              </>
            )}
            <button
              onClick={() => setShowInviteModal(true)}
              style={{
                height: '34px', padding: '0 14px', background: 'var(--surface-card)', color: 'var(--ink)',
                border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Invite Vendor to Register
            </button>
            <button
              onClick={onCreateVendor}
              style={{
                height: '34px', padding: '0 16px', background: 'var(--action)', color: 'var(--surface-card)',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Vendor
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)',
            padding: '48px 0', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)',
          }}>
            {vendors.length === 0 ? 'No vendors yet. Add your first vendor to get started.' : 'No vendors match the current filter.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--taupe-50)', borderBottom: '1px solid var(--taupe-200)' }}>
                    {columnsToShow.map(c => (
                      <th key={c.key} style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </th>
                    ))}
                    <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      Status Timeline
                    </th>
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
                        style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--taupe-100)' : 'none', background: i % 2 === 0 ? 'var(--surface-card)' : 'var(--taupe-50)', cursor: 'pointer' }}
                      >
                        {columnsToShow.map(c => (
                          <td key={c.key} style={{
                            padding: '11px 14px', fontSize: c.key === 'vendor_id' ? '11px' : '12px',
                            color: c.key === 'vendor_id' ? 'var(--action)' : c.key === 'org_name' ? 'var(--ink)' : 'var(--ink)',
                            fontWeight: c.key === 'vendor_id' || c.key === 'org_name' ? 500 : 400,
                            fontFamily: c.key === 'vendor_id' ? 'monospace' : 'inherit',
                            whiteSpace: c.key === 'created_at' ? 'nowrap' : 'normal',
                          }}>
                            {cellValue(v, c.key)}
                            {c.key === 'org_name' && isFinance && dupCount > 0 && (
                              <span
                                onClick={e => { e.stopPropagation(); setPanPreview(vendors.filter(o => o.pan_number === v.pan_number && o.id !== v.id)) }}
                                style={{
                                  marginLeft: '8px', fontSize: '10px', fontWeight: 600, color: 'var(--gold-text)',
                                  background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-lg)',
                                  padding: '1px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                              >
                                ⚠ {dupCount} share{dupCount === 1 ? 's' : ''} this PAN
                              </span>
                            )}
                          </td>
                        ))}
                        <td style={{ padding: '11px 14px' }}>
                          <button
                            onClick={e => { e.stopPropagation(); setStatusVendor(v) }}
                            style={{
                              height: '28px', padding: '0 12px', background: 'var(--surface-card)', color: 'var(--action)',
                              border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            View Status
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--taupe-200)', fontSize: '11px', color: 'var(--text-muted)', background: 'var(--taupe-50)' }}>
              {filtered.length} vendor{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {showInviteModal && (
        <VendorInviteModal user={user} onClose={() => setShowInviteModal(false)} />
      )}

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

      {statusVendor && (
        <VendorStatusModal
          vendor={statusVendor}
          onClose={() => setStatusVendor(null)}
          onDelete={handleDeleteDraft}
          deleting={deletingDraftId === statusVendor.id}
        />
      )}
    </div>
  )
}
