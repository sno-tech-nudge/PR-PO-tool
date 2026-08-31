import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import AdminStats from './AdminStats'
import AdminAllReports from './AdminAllReports'
import AdminReportDetail from './AdminReportDetail'
import ReimbursementBatch from './ReimbursementBatch'
import FinancePRsView from './FinancePRsView'
import ApprovalHistoryView from './ApprovalHistoryView'
import AnalyticsView from './AnalyticsView'
import PRDetail from '../pr/PRDetail'
import VendorList from '../vendor/VendorList'
import VendorSearch from '../vendor/VendorSearch'
import VendorForm from '../vendor/VendorForm'
import VendorDetail from '../vendor/VendorDetail'
import VendorApprovalView from '../vendor/VendorApprovalView'
import BankChangeRequest from '../vendor/BankChangeRequest'
import PODetail from '../po/PODetail'
import AuditTrail from '../audit/AuditTrail'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'reports',  label: 'All Reports' },
  { key: 'pending',  label: 'Pending Payments' },
  { key: 'prs',      label: 'PRs' },
  { key: 'vendors',  label: 'Vendors' },
  { key: 'approval-history', label: 'Approval History' },
  { key: 'analytics', label: 'Analytics' },
]

const shellStyle = { background: '#F4F5F7', minHeight: '100vh' }
const shellInnerStyle = { maxWidth: '960px', margin: '0 auto', padding: '24px 20px' }

export default function FinanceDashboard({ user, showToast, onBack }) {
  const [tab, setTab] = useState('overview')
  const [detailReportId, setDetailReportId] = useState(null)
  const [pendingReports, setPendingReports] = useState([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const [viewingPRId, setViewingPRId] = useState(null)
  const [viewingPOId, setViewingPOId] = useState(null)
  const [auditTrail, setAuditTrail] = useState(null) // { poId, reportId }

  // Vendor sub-screen state — a local mirror of App.jsx's own vendor
  // navigation (list/search/form/detail/approval/bank-change), kept fully
  // independent so the Finance Dashboard's Vendors tab is an additional
  // access path, not a replacement for the top-level "Vendor Management"
  // sidebar item.
  const [vendorSubScreen, setVendorSubScreen] = useState('list')
  const [editingVendor, setEditingVendor] = useState(null)
  const [viewingVendorId, setViewingVendorId] = useState(null)
  const [approvingVendor, setApprovingVendor] = useState(null)
  const [bankChangeVendor, setBankChangeVendor] = useState(null)

  useEffect(() => { loadPending() }, [])

  async function loadPending() {
    setPendingLoading(true)
    const { data } = await supabase
      .from('expense_reports')
      .select(`id, report_reference, total_amount, expense_count, status, brand, approved_at,
        report_expenses (expense_details (id, vendor, category, amount, reimbursement_type))`)
      .eq('status', 'approved')
      .order('approved_at', { ascending: true })
    setPendingReports(data || [])
    setPendingCount((data || []).length)
    setPendingLoading(false)
  }

  function handleReimbursed(ids) {
    setPendingReports(prev => prev.filter(r => !ids.includes(r.id)))
    setPendingCount(prev => prev - ids.length)
  }

  function openVendorCreate()   { setEditingVendor(null); setVendorSubScreen('search') }
  function openVendorForm()     { setVendorSubScreen('form') }
  function openVendorDetail(id) { setViewingVendorId(id); setVendorSubScreen('detail') }
  async function openVendorDraftEdit(id) {
    const { data } = await supabase.from('vendors').select('*').eq('id', id).single()
    if (data) { setEditingVendor(data); setVendorSubScreen('form') }
  }
  function openVendorApproval(v) { setApprovingVendor(v); setVendorSubScreen('approval') }
  function openBankChange(v)     { setBankChangeVendor(v); setVendorSubScreen('bank-change') }
  function openVendorList() {
    setVendorSubScreen('list')
    setEditingVendor(null); setViewingVendorId(null)
    setApprovingVendor(null); setBankChangeVendor(null)
  }

  // ── Drill-downs — each fully replaces the tab bar, same pattern as the
  // pre-existing detailReportId guard (kept first for minimal diff).
  // Audit trail is checked first, before detailReportId/viewingPOId,
  // deliberately without clearing them — clicking "Back" out of the audit
  // trail falls straight back through to whichever of those was already
  // open, the same "return to where you came from" pattern already used
  // for the vendor-from-PR link below.
  if (auditTrail) {
    return (
      <div style={shellStyle}>
        <div style={shellInnerStyle}>
          <AuditTrail
            poId={auditTrail.poId}
            reportId={auditTrail.reportId}
            user={user}
            onBack={() => setAuditTrail(null)}
            onViewVendor={(id) => { setAuditTrail(null); openVendorDetail(id) }}
            onViewPR={(id) => { setAuditTrail(null); setViewingPRId(id) }}
            onViewPO={(id) => { setAuditTrail(null); setViewingPOId(id) }}
            onViewReport={(id) => { setAuditTrail(null); setDetailReportId(id) }}
          />
        </div>
      </div>
    )
  }

  if (detailReportId) {
    return (
      <div style={shellStyle}>
        <div style={shellInnerStyle}>
          <AdminReportDetail reportId={detailReportId} user={user} onBack={() => setDetailReportId(null)} onViewAuditTrail={(poId, reportId) => setAuditTrail({ poId, reportId })} />
        </div>
      </div>
    )
  }

  if (viewingPOId) {
    return (
      <div style={shellStyle}>
        <div style={shellInnerStyle}>
          <PODetail poId={viewingPOId} user={user} onBack={() => setViewingPOId(null)} onViewAuditTrail={(poId) => setAuditTrail({ poId })} />
        </div>
      </div>
    )
  }

  // Vendor sub-screens are checked before viewingPRId deliberately: when a
  // vendor is opened via a PR's vendor link (onViewVendor below), viewingPRId
  // is deliberately left set (not cleared) so that once the vendor screen
  // closes back to vendorSubScreen === 'list', this whole guard chain falls
  // through to the viewingPRId check further down and the same PR reappears
  // — a "back to the PR I came from" for free, no extra state needed.
  if (vendorSubScreen === 'search') {
    return (
      <div style={shellStyle}>
        <VendorSearch onCreateNew={openVendorForm} onSelectExisting={(v) => openVendorDetail(v.id)} onBack={openVendorList} />
      </div>
    )
  }

  if (vendorSubScreen === 'form') {
    return (
      <div style={shellStyle}>
        <VendorForm
          user={user}
          existingVendor={editingVendor}
          onSaved={() => {
            const wasResubmit = editingVendor && editingVendor.status !== 'draft'
            showToast?.(wasResubmit ? 'Vendor resubmitted for approval.' : 'Vendor submitted for approval.', 'info')
            openVendorList()
          }}
          onBack={() => setVendorSubScreen(!editingVendor ? 'search' : editingVendor.status === 'draft' ? 'list' : 'detail')}
        />
      </div>
    )
  }

  if (vendorSubScreen === 'detail') {
    return (
      <div style={shellStyle}>
        <VendorDetail
          vendorId={viewingVendorId}
          user={user}
          onBack={openVendorList}
          backLabel={viewingPRId ? 'Back to Purchase Request' : 'Vendors'}
          onEdit={(v) => { setEditingVendor(v); setVendorSubScreen('form') }}
          onApprove={openVendorApproval}
          onBankChange={openBankChange}
        />
      </div>
    )
  }

  if (vendorSubScreen === 'approval') {
    return (
      <div style={shellStyle}>
        <VendorApprovalView
          vendor={approvingVendor}
          user={user}
          onBack={() => setVendorSubScreen('detail')}
          onActioned={(action) => {
            showToast?.(`Vendor ${action}.`, action === 'approved' ? 'approved' : 'rejected')
            openVendorList()
          }}
        />
      </div>
    )
  }

  if (vendorSubScreen === 'bank-change') {
    return (
      <div style={shellStyle}>
        <BankChangeRequest
          vendor={bankChangeVendor}
          user={user}
          onBack={() => setVendorSubScreen('detail')}
          onSubmitted={() => {
            showToast?.('Bank change request submitted for finance review.', 'info')
            setVendorSubScreen('detail')
          }}
        />
      </div>
    )
  }

  if (viewingPRId) {
    return (
      <div style={shellStyle}>
        <PRDetail
          prId={viewingPRId}
          user={user}
          onBack={() => setViewingPRId(null)}
          onEdit={() => showToast?.('Edit your own PR from the Purchase Requests screen.', 'info')}
          onViewVendor={(id) => openVendorDetail(id)}
          onViewPO={setViewingPOId}
          showToast={showToast}
          backLabel="Purchase Requests"
        />
      </div>
    )
  }

  const pendingTotal = pendingReports.reduce((s, r) => s + (r.total_amount || 0), 0)

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>

      {/* Top header bar */}
      <div style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E3E8EF',
        padding: '0 28px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 0 0', marginBottom: '2px' }}>
            {onBack && (
              <>
                <span
                  onClick={onBack}
                  style={{ fontSize: '12px', color: '#8C3225', cursor: 'pointer' }}
                >
                  Expenses
                </span>
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>/</span>
              </>
            )}
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Finance Admin</span>
          </div>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1F36', margin: 0, padding: '8px 0' }}>
              Finance Dashboard
            </h1>
            {pendingCount > 0 && (
              <div
                onClick={() => setTab('pending')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#FFF7ED', border: '1px solid #FED7AA',
                  padding: '6px 14px', cursor: 'pointer', borderRadius: '4px',
                }}
              >
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#EA580C', flexShrink: 0,
                }} />
                <span style={{ fontSize: '12px', color: '#9A3412', fontWeight: 500 }}>
                  {pendingCount} report{pendingCount !== 1 ? 's' : ''} awaiting payment
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#7C2D12' }}>
                  INR {Number(pendingTotal).toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '0', marginTop: '4px', overflowX: 'auto' }}>
            {TABS.map(t => (
              <div
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? '#1565C0' : '#6B7280',
                  borderBottom: tab === t.key ? '2px solid #1565C0' : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  marginBottom: '-1px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                {t.label}
                {t.key === 'pending' && pendingCount > 0 && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: '#DC2626', color: '#FFFFFF',
                    borderRadius: '10px', padding: '1px 6px', lineHeight: '16px',
                  }}>
                    {pendingCount}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 28px' }}>

        {tab === 'overview' && <AdminStats />}

        {tab === 'reports' && (
          <AdminAllReports onViewDetail={id => setDetailReportId(id)} />
        )}

        {tab === 'pending' && (
          pendingLoading
            ? <div style={{ fontSize: '13px', color: '#6B7280', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
            : <ReimbursementBatch reports={pendingReports} onReimbursed={handleReimbursed} />
        )}

        {tab === 'prs' && (
          <FinancePRsView onViewPR={setViewingPRId} />
        )}

        {tab === 'vendors' && vendorSubScreen === 'list' && (
          <VendorList user={user} onViewVendor={openVendorDetail} onCreateVendor={openVendorCreate} onResumeDraft={openVendorDraftEdit} />
        )}

        {tab === 'approval-history' && (
          <ApprovalHistoryView
            onViewVendor={openVendorDetail}
            onViewPR={setViewingPRId}
            onViewPO={setViewingPOId}
          />
        )}

        {tab === 'analytics' && (
          <AnalyticsView
            user={user}
            onViewVendor={openVendorDetail}
            onViewPR={setViewingPRId}
            onViewPO={setViewingPOId}
          />
        )}
      </div>
    </div>
  )
}
