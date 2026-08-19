import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { getSession, canAccessApprovals, canAccessFinance, signOut } from './lib/auth'
import LoginScreen from './components/auth/LoginScreen'
import OfflineBanner from './components/capture/OfflineBanner'
import NewExpense from './components/capture/NewExpense'
import QuickAddDropzone from './components/capture/QuickAddDropzone'
import FeedbackWidget from './components/shared/FeedbackWidget'
import ExpenseDetails from './components/layer2/ExpenseDetails'
import PolicyCheck from './components/layer3/PolicyCheck'
import ExpenseSelector from './components/layer4/ExpenseSelector'
import ReportPreview from './components/layer4/ReportPreview'
import ReportDetails from './components/layer4/ReportDetails'
import NewReportModal from './components/layer4/NewReportModal'
import SubmissionConfirmation from './components/layer5/SubmissionConfirmation'
import ReportStatus from './components/layer5/ReportStatus'
import ApproverDashboard from './components/layer5/ApproverDashboard'
import ApproverReportView from './components/layer5/ApproverReportView'
import HomeScreenAddons from './components/layer5/HomeScreenAddons'
import NotificationToast from './components/layer5/NotificationToast'
import FinanceDashboard from './components/layer6/FinanceDashboard'
import ReimbursedConfirmation from './components/layer6/ReimbursedConfirmation'
import ExpenseHistoryScreen from './components/layer2/ExpenseHistoryScreen'

// Vendor module
import VendorSearch from './components/vendor/VendorSearch'
import VendorForm from './components/vendor/VendorForm'
import VendorList from './components/vendor/VendorList'
import VendorDetail from './components/vendor/VendorDetail'
import VendorApprovalView from './components/vendor/VendorApprovalView'
import BankChangeRequest from './components/vendor/BankChangeRequest'

// PR module
import PRList from './components/pr/PRList'
import PRForm from './components/pr/PRForm'
import PRDetail from './components/pr/PRDetail'
import PRApproverDashboard from './components/pr/PRApproverDashboard'

// PO module
import POList from './components/po/POList'
import PODetail from './components/po/PODetail'

const SIDEBAR_W = 220

// Sub-screens map to their parent nav key for sidebar highlight
const SCREEN_PARENT = {
  capture: 'list',
  details: 'list',
  policy: 'list',
  layer4: 'list',
  layer5: 'list',
  status: 'list',
  reimbursed: 'list',
  'approval-view': 'approvals',
  'pr-approval-view': 'approvals',
  'po-list': 'po-list',
}

export default function App() {
  const [user, setUser] = useState(() => getSession())

  function handleLogin(u) { setUser(u) }

  const [appScreen, setAppScreen] = useState('list')
  const [layer1Data, setLayer1Data] = useState(null)
  const [reportExpenses, setReportExpenses] = useState([])

  const [layer4Screen, setLayer4Screen] = useState('selector')
  const [layer4Expenses, setLayer4Expenses] = useState([])
  const [layer4Results, setLayer4Results] = useState([])
  const [selectedExpenses, setSelectedExpenses] = useState([])
  const [selectedResults, setSelectedResults] = useState([])
  const [layer4ReportDetails, setLayer4ReportDetails] = useState(null)
  const [newReportMeta, setNewReportMeta] = useState(null)
  const [showNewReportModal, setShowNewReportModal] = useState(false)

  const [submissionData, setSubmissionData] = useState(null)
  const [currentReportId, setCurrentReportId] = useState(null)
  const [approvalReportId, setApprovalReportId] = useState(null)
  const [reimbursedData, setReimbursedData] = useState(null)

  const [vendorSubScreen, setVendorSubScreen] = useState('list')
  const [editingVendor, setEditingVendor] = useState(null)
  const [viewingVendorId, setViewingVendorId] = useState(null)
  const [approvingVendor, setApprovingVendor] = useState(null)
  const [bankChangeVendor, setBankChangeVendor] = useState(null)

  const [prSubScreen, setPRSubScreen] = useState('list')
  const [editingPR, setEditingPR] = useState(null)
  const [viewingPRId, setViewingPRId] = useState(null)
  const [approvingPRId, setApprovingPRId] = useState(null)

  // PO state
  const [viewingPOId, setViewingPOId] = useState(null)
  const [poSubScreen, setPOSubScreen] = useState('list')
  const [approvalsTab, setApprovalsTab] = useState('expenses')

  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!currentReportId) return
    const channel = supabase
      .channel(`reimbursement-watch-${currentReportId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'expense_reports', filter: `id=eq.${currentReportId}` },
        payload => {
          if (payload.new?.status === 'reimbursed') {
            setReimbursedData({ reportId: currentReportId })
            setAppScreen('reimbursed')
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentReportId])

  function showToast(msg, type = 'info') { setToast({ message: msg, type }) }

  function handleContinueToDetails(data) { setLayer1Data(data); setAppScreen('details') }
  function handleSaved()                 { setAppScreen('list') }
  function handleAddAnother()            { setLayer1Data(null); setAppScreen('capture') }
  function handleQuickReceipt(data)      { setLayer1Data(data); setAppScreen('details') }

  function handleProceedToReport({ expenses, results }) {
    setLayer4Expenses(expenses); setLayer4Results(results)
    setLayer4Screen('selector'); setAppScreen('layer4')
  }

  function handleLayer4Preview(selected, selResults) {
    setSelectedExpenses(selected); setSelectedResults(selResults)
    setLayer4Screen('details')
  }

  function handleLayer4Details(reportDetails) {
    setLayer4ReportDetails(reportDetails); setLayer4Screen('preview')
  }

  function handleLayer4Submitted(data) { setSubmissionData(data); setAppScreen('layer5') }
  function handleTrackReport(id)       { setCurrentReportId(id); setAppScreen('status') }

  // A draft report was never submitted — its own workspace (drag receipts in,
  // pick from saved expenses) is what "viewing" it should mean, not the
  // submitted-report status tracker, which has nothing meaningful to show
  // for something no approver has ever seen.
  async function handleViewReport(id) {
    const { data: reportRow } = await supabase
      .from('expense_reports')
      .select('*')
      .eq('id', id)
      .single()
    if (reportRow?.status === 'draft') {
      await enterReportWorkspace(reportRow)
      return
    }
    setCurrentReportId(id)
    setAppScreen('status')
  }

  function handleNewReport() { setShowNewReportModal(true) }

  async function enterReportWorkspace(reportRow) {
    setNewReportMeta(reportRow)
    setLayer4Expenses([]); setLayer4Results([])
    setLayer4Screen('selector')
    const { data } = await supabase
      .from('expense_details')
      .select('*')
      .eq('user_email', user.email)
      .eq('status', 'saved')
      .order('created_at', { ascending: false })
    setReportExpenses(data || [])
    setAppScreen('policy')
  }

  async function handleReportCreated(reportRow) {
    setShowNewReportModal(false)
    await enterReportWorkspace(reportRow)
  }

  function handleSignOut() { signOut(); setUser(null); setAppScreen('list') }

  function openVendorCreate()        { setEditingVendor(null); setVendorSubScreen('search') }
  function openVendorForm()          { setVendorSubScreen('form') }
  function openVendorDetail(id)      { setViewingVendorId(id); setVendorSubScreen('detail') }
  async function openDraftEdit(id) {
    const { data } = await supabase.from('vendors').select('*').eq('id', id).single()
    if (data) { setEditingVendor(data); setVendorSubScreen('form') }
  }
  function openVendorApproval(v)     { setApprovingVendor(v); setVendorSubScreen('approval') }
  function openBankChange(v)         { setBankChangeVendor(v); setVendorSubScreen('bank-change') }
  function openVendorList() {
    setVendorSubScreen('list')
    setEditingVendor(null); setViewingVendorId(null)
    setApprovingVendor(null); setBankChangeVendor(null)
  }

  function openPRCreate()   { setEditingPR(null); setPRSubScreen('form') }
  function openPRDetail(id) { setViewingPRId(id); setPRSubScreen('detail') }
  function openPRList()     { setPRSubScreen('list'); setEditingPR(null); setViewingPRId(null) }
  function openPREdit(pr)   { setEditingPR(pr); setPRSubScreen('form') }
  async function openPRDraftEdit(id) {
    const { data } = await supabase.from('purchase_requests').select('*').eq('id', id).single()
    if (data) openPREdit(data)
  }

  function openPODetail(id) { setViewingPOId(id); setPOSubScreen('detail') }
  function openPOList()     { setPOSubScreen('list'); setViewingPOId(null) }

  if (!user) return <LoginScreen onLogin={handleLogin} />

  const role = user.role

  const navItems = [
    { key: 'list',    label: 'Home',              icon: '⊞' },
    { key: 'history', label: 'History',            icon: '☰' },
    ...(canAccessApprovals(role) ? [{ key: 'approvals', label: 'Approvals', icon: '✓' }] : []),
    ...(canAccessFinance(role)   ? [{ key: 'finance',   label: 'Finance',   icon: '₹' }] : []),
    { key: 'pr-list', label: 'Purchase Requests',  icon: '◫' },
    { key: 'po-list', label: 'Purchase Orders',    icon: '◻' },
    { key: 'vendors', label: role === 'finance' ? 'Vendor Management' : 'Vendors', icon: '⬡' },
  ]

  const activeNav = SCREEN_PARENT[appScreen] || appScreen
  const moduleName = navItems.find(n => n.key === activeNav)?.label || appScreen

  function handleNavClick(key) {
    if (key === 'vendors') openVendorList()
    if (key === 'pr-list') openPRList()
    if (key === 'po-list') openPOList()
    setAppScreen(key)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F5F7' }}>

      {/* ── Left sidebar ── */}
      <div style={{
        width: SIDEBAR_W,
        minHeight: '100vh',
        background: '#1C0A06',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        boxShadow: '2px 0 12px rgba(140,50,37,0.25)',
      }}>
        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
            The Nudge Institute
          </div>
          <div style={{ fontSize: '10px', color: '#c4826f', marginTop: '3px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
            Expense Tracker
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {navItems.map(({ key, label, icon }) => {
            const active = activeNav === key
            return (
              <div
                key={key}
                onClick={() => handleNavClick(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 16px 10px 17px',
                  cursor: 'pointer',
                  borderLeft: active ? '3px solid #E8A090' : '3px solid transparent',
                  background: active ? 'rgba(140,50,37,0.25)' : 'transparent',
                  color: active ? '#FFFFFF' : '#c4826f',
                  fontSize: '13px', fontWeight: active ? 600 : 400,
                  transition: 'all 0.1s',
                  userSelect: 'none',
                }}
              >
                <span style={{ fontSize: '13px', minWidth: '16px', textAlign: 'center', opacity: active ? 1 : 0.7 }}>
                  {icon}
                </span>
                {label}
              </div>
            )
          })}

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />

          <div
            onClick={handleAddAnother}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 16px 9px 17px', cursor: 'pointer',
              color: '#E8A090', fontSize: '13px', fontWeight: 600,
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '16px', minWidth: '16px', textAlign: 'center' }}>+</span>
            New Expense
          </div>
          <div
            onClick={handleNewReport}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 16px 9px 17px', cursor: 'pointer',
              color: '#c4826f', fontSize: '13px',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '13px', minWidth: '16px', textAlign: 'center', opacity: 0.7 }}>◷</span>
            New Report
          </div>
        </nav>

        {/* User info + sign out */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{
            fontSize: '12px', fontWeight: 600, color: '#FFFFFF',
            marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.name}
          </div>
          <div style={{ fontSize: '10px', color: '#c4826f', marginBottom: '10px' }}>
            {user.roleLabel}
          </div>
          <button
            onClick={handleSignOut}
            style={{
              width: '100%', padding: '6px 0',
              background: 'transparent',
              border: '1px solid rgba(196,130,111,0.35)',
              color: '#c4826f', borderRadius: '5px',
              fontSize: '11px', cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ marginLeft: SIDEBAR_W, flex: 1, minHeight: '100vh', overflowX: 'hidden' }}>
        <OfflineBanner />

        {toast && (
          <NotificationToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        )}

        {appScreen === 'capture' && (
          <div style={{ padding: '32px 24px' }}>
            <NewExpense user={user} onContinueToDetails={handleContinueToDetails} onBack={() => setAppScreen('list')} />
          </div>
        )}

        {appScreen === 'details' && (
          <div style={{ maxWidth: '520px', margin: '0 auto', padding: '32px 24px' }}>
            <ExpenseDetails
              layer1Data={layer1Data}
              user={user}
              onSaved={handleSaved}
              onBack={() => setAppScreen('capture')}
            />
          </div>
        )}

        {appScreen === 'list' && (
          <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 24px' }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>
                Hello, {user.name.split(' ')[0]} 👋
              </div>
              <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '4px' }}>
                {user.roleLabel} · {user.email}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '20px', marginBottom: '28px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827', marginBottom: '16px' }}>Quick Add</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '14px' }}>
                <QuickAddDropzone onReady={handleQuickReceipt} />

                <div
                  onClick={handleAddAnother}
                  style={{
                    border: '1px solid #E5E7EB', borderRadius: '10px', padding: '28px 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', minHeight: '148px', boxSizing: 'border-box', textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: '#fdf0ed',
                    color: '#8C3225', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: 700, marginBottom: '10px',
                  }}>
                    +
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1A1F36' }}>New Expense</div>
                </div>

                <div
                  onClick={handleNewReport}
                  style={{
                    border: '1px solid #E5E7EB', borderRadius: '10px', padding: '28px 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', minHeight: '148px', boxSizing: 'border-box', textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: '#fdf0ed',
                    color: '#8C3225', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', marginBottom: '10px',
                  }}>
                    ◷
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1A1F36' }}>New Report</div>
                </div>
              </div>
            </div>

            <HomeScreenAddons user={user} onViewReport={handleViewReport} />
          </div>
        )}

        {appScreen === 'policy' && (
          <PolicyCheck
            expenses={reportExpenses}
            onAddAnother={handleAddAnother}
            onProceedToReport={handleProceedToReport}
            onBack={() => setAppScreen('list')}
          />
        )}

        {appScreen === 'layer4' && layer4Screen === 'selector' && (
          <ExpenseSelector
            expenses={layer4Expenses}
            results={layer4Results}
            user={user}
            reportMeta={newReportMeta}
            onPreview={handleLayer4Preview}
            onBack={() => setAppScreen('list')}
          />
        )}

        {appScreen === 'layer4' && layer4Screen === 'details' && (
          <ReportDetails
            expenses={selectedExpenses}
            results={selectedResults}
            reportMeta={newReportMeta}
            onContinue={handleLayer4Details}
            onBack={() => setLayer4Screen('selector')}
          />
        )}

        {appScreen === 'layer4' && layer4Screen === 'preview' && (
          <ReportPreview
            expenses={selectedExpenses}
            results={selectedResults}
            reportDetails={layer4ReportDetails}
            user={user}
            onSubmitted={handleLayer4Submitted}
            onBack={() => setLayer4Screen('details')}
          />
        )}

        {showNewReportModal && (
          <NewReportModal
            user={user}
            onCreated={handleReportCreated}
            onClose={() => setShowNewReportModal(false)}
          />
        )}

        {appScreen === 'layer5' && (
          <SubmissionConfirmation
            submission={submissionData}
            onStartNew={handleAddAnother}
            onTrackReport={handleTrackReport}
          />
        )}

        {appScreen === 'status' && (
          <ReportStatus
            reportId={currentReportId}
            initialData={submissionData}
            user={user}
            onBack={() => setAppScreen('list')}
            onStartNew={handleAddAnother}
          />
        )}

        {/* ── Approvals hub ── */}
        {appScreen === 'approvals' && (
          <div>
            <div style={{
              display: 'flex', padding: '0 24px',
              background: '#FFFFFF', borderBottom: '1px solid #E8E8E8',
            }}>
              {[['expenses', 'Expense Reports'], ['prs', 'Purchase Requests']].map(([key, label]) => (
                <div
                  key={key}
                  onClick={() => setApprovalsTab(key)}
                  style={{
                    padding: '14px 16px', fontSize: '13px', cursor: 'pointer',
                    fontWeight: approvalsTab === key ? 600 : 400,
                    color: approvalsTab === key ? '#1A1A1A' : '#6B6B6B',
                    borderBottom: approvalsTab === key ? '2px solid #8C3225' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
            {approvalsTab === 'expenses' && (
              <ApproverDashboard
                user={user}
                onViewReport={(id) => { setApprovalReportId(id); setAppScreen('approval-view') }}
                onBack={() => setAppScreen('list')}
              />
            )}
            {approvalsTab === 'prs' && (
              <PRApproverDashboard
                user={user}
                onViewPR={(id) => { setApprovingPRId(id); setAppScreen('pr-approval-view') }}
                onBack={() => setAppScreen('list')}
              />
            )}
          </div>
        )}

        {appScreen === 'approval-view' && (
          <ApproverReportView
            reportId={approvalReportId}
            onBack={() => setAppScreen('approvals')}
            showToast={showToast}
          />
        )}

        {appScreen === 'pr-approval-view' && (
          <PRDetail
            prId={approvingPRId}
            user={user}
            onBack={() => setAppScreen('approvals')}
            onEdit={(pr) => { setAppScreen('pr-list'); openPREdit(pr) }}
            onViewVendor={(id) => { setAppScreen('vendors'); openVendorDetail(id) }}
            showToast={showToast}
            backLabel="PR Approvals"
          />
        )}

        {appScreen === 'finance' && (
          <FinanceDashboard user={user} showToast={showToast} onBack={() => setAppScreen('list')} />
        )}

        {appScreen === 'reimbursed' && (
          <ReimbursedConfirmation
            reportId={reimbursedData?.reportId}
            onStartNew={handleAddAnother}
            onBack={() => setAppScreen('list')}
          />
        )}

        {appScreen === 'history' && (
          <ExpenseHistoryScreen
            user={user}
            onViewReport={handleViewReport}
            onBack={() => setAppScreen('list')}
          />
        )}

        {/* ── Vendor screens ── */}
        {appScreen === 'vendors' && vendorSubScreen === 'list' && (
          <VendorList user={user} onViewVendor={openVendorDetail} onCreateVendor={openVendorCreate} onResumeDraft={openDraftEdit} />
        )}
        {appScreen === 'vendors' && vendorSubScreen === 'search' && (
          <VendorSearch onCreateNew={openVendorForm} onSelectExisting={(v) => openVendorDetail(v.id)} />
        )}
        {appScreen === 'vendors' && vendorSubScreen === 'form' && (
          <VendorForm
            user={user}
            existingVendor={editingVendor}
            onSaved={() => {
              const wasResubmit = editingVendor && editingVendor.status !== 'draft'
              showToast(wasResubmit ? 'Vendor resubmitted for approval.' : 'Vendor submitted for approval.', 'info')
              openVendorList()
            }}
            onBack={() => setVendorSubScreen(!editingVendor ? 'search' : editingVendor.status === 'draft' ? 'list' : 'detail')}
          />
        )}
        {appScreen === 'vendors' && vendorSubScreen === 'detail' && (
          <VendorDetail
            vendorId={viewingVendorId}
            user={user}
            onBack={openVendorList}
            onEdit={(v) => { setEditingVendor(v); setVendorSubScreen('form') }}
            onApprove={openVendorApproval}
            onBankChange={openBankChange}
          />
        )}
        {appScreen === 'vendors' && vendorSubScreen === 'approval' && (
          <VendorApprovalView
            vendor={approvingVendor}
            user={user}
            onBack={() => setVendorSubScreen('detail')}
            onActioned={(action) => {
              showToast(`Vendor ${action}.`, action === 'approved' ? 'approved' : 'rejected')
              openVendorList()
            }}
          />
        )}
        {appScreen === 'vendors' && vendorSubScreen === 'bank-change' && (
          <BankChangeRequest
            vendor={bankChangeVendor}
            user={user}
            onBack={() => setVendorSubScreen('detail')}
            onSubmitted={() => {
              showToast('Bank change request submitted for finance review.', 'info')
              setVendorSubScreen('detail')
            }}
          />
        )}

        {/* ── PO screens ── */}
        {appScreen === 'po-list' && poSubScreen === 'list' && (
          <POList user={user} onViewPO={openPODetail} />
        )}
        {appScreen === 'po-list' && poSubScreen === 'detail' && (
          <PODetail poId={viewingPOId} user={user} onBack={openPOList} />
        )}

        {/* ── PR screens ── */}
        {appScreen === 'pr-list' && prSubScreen === 'list' && (
          <PRList user={user} onViewPR={openPRDetail} onCreatePR={openPRCreate} onResumeDraft={openPRDraftEdit} />
        )}
        {appScreen === 'pr-list' && prSubScreen === 'form' && (
          <PRForm
            user={user}
            existingPR={editingPR}
            onSaved={({ prNumber }) => {
              showToast(`Purchase request ${prNumber} submitted.`, 'info')
              openPRList()
            }}
            onBack={openPRList}
          />
        )}
        {appScreen === 'pr-list' && prSubScreen === 'detail' && (
          <PRDetail
            prId={viewingPRId}
            user={user}
            onBack={openPRList}
            onEdit={openPREdit}
            onViewVendor={(id) => { setAppScreen('vendors'); openVendorDetail(id) }}
            showToast={showToast}
          />
        )}
      </div>

      <FeedbackWidget user={user} moduleName={moduleName} />
    </div>
  )
}
