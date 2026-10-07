import { useState, useEffect } from 'react'
import wordmarkLogo from './assets/logos/thenudge-wordmark-cream.png'
import { supabase } from './lib/supabase'
import { getSession, canAccessApprovals, canAccessFinance, canCreatePR, isObserver, signOut } from './lib/auth'
import { preloadDirectory } from './lib/directory'
import { useIsMobile } from './hooks/useIsMobile'
import LoginScreen from './components/auth/LoginScreen'
import OfflineBanner from './components/capture/OfflineBanner'
import NewExpense from './components/capture/NewExpense'
import QuickAddDropzone from './components/capture/QuickAddDropzone'
import FeedbackWidget from './components/shared/FeedbackWidget'
import FirstTimeWalkthrough from './components/shared/FirstTimeWalkthrough'
import LanguageToggle from './components/shared/LanguageToggle'
import { hasSeenWalkthrough } from './lib/walkthrough'
import NotificationBell from './components/shared/NotificationBell'
import SettingsView from './components/settings/SettingsView'
import ExpenseDetails from './components/layer2/ExpenseDetails'
import ExpenseSelector from './components/layer4/ExpenseSelector'
import ReportPreview from './components/layer4/ReportPreview'
import ReportWorkspace from './components/layer4/ReportWorkspace'
import { logActivity } from './lib/activityLog'
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
import PublicVendorRegister from './components/vendor/PublicVendorRegister'

// PR module
import PRList from './components/pr/PRList'
import PRForm from './components/pr/PRForm'
import PRDetail from './components/pr/PRDetail'
import PRApproverDashboard from './components/pr/PRApproverDashboard'

// PO module
import POList from './components/po/POList'
import PODetail from './components/po/PODetail'

// Advance module
import AdvanceList from './components/advance/AdvanceList'
import AdvanceForm from './components/advance/AdvanceForm'
import AdvanceApproverDashboard from './components/advance/AdvanceApproverDashboard'
import AdvanceApprovalView from './components/advance/AdvanceApprovalView'

// Audit module
import AuditTrail from './components/audit/AuditTrail'
import ActivityLog from './components/audit/ActivityLog'

const SIDEBAR_W = 220
const SIDEBAR_RAIL_W = 68

// Sidebar icons: one consistent set of thin line icons (24px grid, 1.7px
// stroke, round caps) drawn in the current text colour, so active / muted
// states and the folded rail all tint them automatically.
const NAV_ICON_PATHS = {
  list: ['M3 11.5 12 4l9 7.5', 'M5.5 10v9.5a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5V10', 'M10 20v-5.5h4V20'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1', 'M3.5 4v4.5H8', 'M12 8v4.5l3 1.8'],
  'my-expenses': ['M6 3.5h12v17l-2.5-1.7-1.75 1.7-1.75-1.7-1.75 1.7-1.75-1.7L6 20.5z', 'M9.5 8.5h5', 'M9.5 12h5'],
  approvals: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'm8.3 12.2 2.6 2.6 4.8-5.2'],
  finance: ['M3 7.5h18v10H3z', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M6.5 10.5v.01', 'M17.5 11.5v.01'],
  advances: ['M7 3.5h10', 'M7 20.5h10', 'M8 3.5c0 3 1.5 4.5 4 8.5-2.5 4-4 5.5-4 8.5', 'M16 3.5c0 3-1.5 4.5-4 8.5 2.5 4 4 5.5 4 8.5'],
  'pr-list': ['M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 7 4.5z', 'M9.5 3h5v3h-5z', 'M9 11.5h6', 'M9 15.5h4'],
  'po-list': ['M20.5 7.8 12 3 3.5 7.8v8.4L12 21l8.5-4.8z', 'm3.5 7.8 8.5 4.8 8.5-4.8', 'M12 12.6V21'],
  vendors: ['M4 20.5h16', 'M6 20.5V6.5l6-3 6 3v14', 'M9.5 10h1', 'M13.5 10h1', 'M9.5 14h1', 'M13.5 14h1'],
  'activity-log': ['M3 12h4l2.5-7 5 14 2.5-7H21'],
  settings: ['M4 7h9', 'M17 7h3', 'M4 12h3', 'M11 12h9', 'M4 17h11', 'M19 17h1', 'M15 7m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0', 'M9 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0', 'M17 17m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0'],
  'new-expense': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v8', 'M8 12h8'],
  'new-report': ['M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z', 'M14 3.5V8h4.5', 'M12 11.5v6', 'M9 14.5h6'],
}

function NavIcon({ name, size = 18, fallback }) {
  const paths = NAV_ICON_PATHS[name]
  if (!paths) return <span>{fallback}</span>
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

// Broad icon for folding / unfolding the sidebar: a window with a side panel
// and an arrow that points the way the sidebar will move.
function SidebarToggleIcon({ collapsed }) {
  const c = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width="22" height="15" viewBox="0 0 30 20" aria-hidden="true">
      <rect {...c} x="1.5" y="1.5" width="27" height="17" rx="3" />
      <line {...c} x1="11" y1="1.5" x2="11" y2="18.5" />
      <path {...c} d={collapsed ? 'M16 6.5 L20 10 L16 13.5' : 'M20 6.5 L16 10 L20 13.5'} />
    </svg>
  )
}

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
  'advance-approval-view': 'approvals',
  'po-list': 'po-list',
}

export default function App() {
  const [user, setUser] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  // The sidebar is fixed/always-visible on desktop; below the mobile
  // breakpoint it becomes a slide-out drawer instead, closed by default so
  // it doesn't eat most of a phone-width screen.
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Desktop only: the sidebar can fold down to an icon rail so forms and
  // tables get the room. The choice is remembered on this device.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('nudge_sidebar_collapsed') === '1' } catch { return false }
  })
  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem('nudge_sidebar_collapsed', next ? '1' : '0') } catch { /* storage unavailable */ }
      return next
    })
  }
  const rail = !isMobile && collapsed
  const sbW = isMobile ? SIDEBAR_W : (rail ? SIDEBAR_RAIL_W : SIDEBAR_W)
  // Other screens (fixed bottom bars, wide layouts) read the current sidebar
  // width from this variable instead of assuming 220px.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${isMobile ? 0 : sbW}px`)
    window.dispatchEvent(new Event('nudge-sidebar-change'))
  }, [isMobile, sbW])

  // Auto-shows once per browser on a first visit to Home; the sidebar's
  // "? Help" button can also reopen it any time afterward regardless of the
  // stored flag (see handleReplayWalkthrough below).
  const [walkthroughOpen, setWalkthroughOpen] = useState(false)
  const [walkthroughAutoShown, setWalkthroughAutoShown] = useState(false)

  useEffect(() => {
    let cancelled = false
    preloadDirectory()
    getSession().then(u => {
      if (!cancelled) { setUser(u); setSessionLoading(false) }
    })
    return () => { cancelled = true }
  }, [])

  function handleLogin(u) { setUser(u) }

  const [appScreen, setAppScreen] = useState('list')

  useEffect(() => {
    if (appScreen === 'list' && user && !walkthroughAutoShown && !hasSeenWalkthrough()) {
      setWalkthroughAutoShown(true)
      setWalkthroughOpen(true)
    }
  }, [appScreen, user, walkthroughAutoShown])

  function handleReplayWalkthrough() {
    setAppScreen('list')
    setWalkthroughOpen(true)
    if (isMobile) setSidebarOpen(false)
  }

  const [layer1Data, setLayer1Data] = useState(null)

  const [layer4Screen, setLayer4Screen] = useState('selector')
  const [layer4Expenses, setLayer4Expenses] = useState([])
  const [layer4Results, setLayer4Results] = useState([])
  const [selectedExpenses, setSelectedExpenses] = useState([])
  const [selectedResults, setSelectedResults] = useState([])
  const [layer4ReportDetails, setLayer4ReportDetails] = useState(null)
  const [newReportMeta, setNewReportMeta] = useState(null)
  const [showNewReportModal, setShowNewReportModal] = useState(false)
  // Ids selected from the standalone "My Expenses" browser before a report
  // exists yet — tagged onto the draft the moment NewReportModal creates it,
  // so they land pre-selected in ExpenseSelector via its own existing
  // report_id-match effect, same as dropping a receipt onto a report page.
  const [pendingPreSelectedExpenseIds, setPendingPreSelectedExpenseIds] = useState([])
  // Set when a report is started straight from a PO's Submit Expense flow, so
  // the new-report popup already knows the PO and doesn't ask about it again.
  const [fixedPOForReport, setFixedPOForReport] = useState(null)

  const [submissionData, setSubmissionData] = useState(null)
  const [currentReportId, setCurrentReportId] = useState(null)
  const [approvalReportId, setApprovalReportId] = useState(null)
  const [reimbursedData, setReimbursedData] = useState(null)

  const [vendorSubScreen, setVendorSubScreen] = useState('list')
  const [editingVendor, setEditingVendor] = useState(null)
  const [viewingVendorId, setViewingVendorId] = useState(null)
  // Set when a vendor is opened via a cross-link from a PR (see PRDetail's
  // onViewVendor below), so VendorDetail's back button returns to that PR
  // instead of always resetting to the vendor list. null = normal vendor flow.
  const [vendorBackScreen, setVendorBackScreen] = useState(null)
  const [financeResetKey, setFinanceResetKey] = useState(0)
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

  // Advance state
  const [advanceSubScreen, setAdvanceSubScreen] = useState('list')
  const [approvingAdvance, setApprovingAdvance] = useState(null)

  // Audit trail — entry point is always a PO id (a report's own audit
  // trail is just that PO's trail, resolved via the report's po_id), plus
  // the screen to return to when the admin clicks "Back".
  const [auditTrailPOId, setAuditTrailPOId] = useState(null)
  const [auditTrailReturnScreen, setAuditTrailReturnScreen] = useState('po-list')

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

  // Deep link support — Slack notifications link back with ?type=pr|po&id=...
  // so a click lands directly on that record instead of just opening the app.
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    const type = params.get('type')
    const id = params.get('id')
    if (!type || !id) return
    if (type === 'pr') { setAppScreen('pr-list'); setViewingPRId(id); setPRSubScreen('detail') }
    if (type === 'po') { setAppScreen('po-list'); setViewingPOId(id); setPOSubScreen('detail') }
    window.history.replaceState({}, '', window.location.pathname)
  }, [user])

  function showToast(msg, type = 'info') { setToast({ message: msg, type }) }

  function handleContinueToDetails(data) { setLayer1Data(data); setAppScreen('details') }
  function handleSaved()                 { setAppScreen('list') }
  function handleAddAnother()            { setLayer1Data(null); setAppScreen('capture') }
  function handleQuickReceipt(data)      { setLayer1Data(data); setAppScreen('details') }

  // New-report flow: pick expenses (selector) -> receipts on the left and the
  // details form on the right (workspace) -> preview/submit. Policy flags are
  // computed when leaving the workspace and surface on the preview, not
  // before.
  function handleSelectionContinue(selected) {
    setSelectedExpenses(selected)
    setLayer4Screen('workspace')
  }

  function handleWorkspacePreview(rows, results, meta) {
    setNewReportMeta(meta)
    setSelectedExpenses(rows); setSelectedResults(results)
    setLayer4ReportDetails({
      report_id: meta?.id || null,
      report_reference: meta?.report_reference || null,
      business_purpose: meta?.business_purpose || null,
      duration_start: meta?.duration_start || null,
      duration_end: meta?.duration_end || null,
      po_related: meta?.po_related ?? null,
      linked_po_id: meta?.po_related ? meta?.po_id : null,
      status: meta?.status || null,
      rejection_reason: meta?.rejection_reason || null,
      rejected_at: meta?.rejected_at || null,
    })
    setLayer4Screen('preview')
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
    // Your own returned report opens straight into the editor, with the
    // reason shown at the top — nothing to hunt for, nothing to restart.
    const mine = (user?.ownEmails || [user?.email]).map(e => String(e || '').toLowerCase())
    if (reportRow?.status === 'rejected' && mine.includes(String(reportRow.employee_email || '').toLowerCase())) {
      await reopenRejectedReport(reportRow)
      return
    }
    setCurrentReportId(id)
    setAppScreen('status')
  }

  // A returned (rejected) report goes back to draft with its rejection reason
  // kept, and opens in the report workspace with its own expenses loaded.
  // Its old approval records are cleared when it is resubmitted.
  async function reopenRejectedReport(reportRow) {
    await supabase.from('expense_reports').update({ status: 'draft' }).eq('id', reportRow.id).eq('status', 'rejected')
    const { data: links } = await supabase.from('report_expenses').select('expense_id').eq('report_id', reportRow.id)
    const ids = (links || []).map(l => l.expense_id)
    let exps = []
    if (ids.length) {
      // Rejection already frees these back to 'saved'; older rejections may
      // still show 'reported', so make sure either way.
      await supabase.from('expense_details').update({ status: 'saved', report_id: reportRow.id }).in('id', ids)
      const { data } = await supabase.from('expense_details').select('*').in('id', ids)
      exps = data || []
    }
    logActivity({ entityType: 'report', entityId: reportRow.id, entityRef: reportRow.report_reference, action: 'reopened_for_edit', fromValue: 'rejected', toValue: 'draft', actor: user })
    setNewReportMeta({ ...reportRow, status: 'draft', _durationConfirmed: true })
    setLayer4Expenses([]); setLayer4Results([])
    setSelectedExpenses(exps); setSelectedResults([])
    setLayer4Screen(exps.length ? 'workspace' : 'selector')
    setAppScreen('layer4')
  }

  async function handleEditRejected(id) {
    const { data: reportRow } = await supabase.from('expense_reports').select('*').eq('id', id).single()
    if (reportRow) await reopenRejectedReport(reportRow)
  }

  function handleNewReport() { setShowNewReportModal(true) }

  function handleRaiseReportFromPO({ poId, poNumber, expenseId }) {
    setPendingPreSelectedExpenseIds([expenseId])
    setFixedPOForReport({ id: poId, po_number: poNumber })
    setShowNewReportModal(true)
  }

  function handleRaiseReportFromSelection(selectedIds) {
    setPendingPreSelectedExpenseIds(selectedIds)
    setShowNewReportModal(true)
  }

  function enterReportWorkspace(reportRow) {
    setNewReportMeta(reportRow)
    setLayer4Expenses([]); setLayer4Results([])
    setSelectedExpenses([]); setSelectedResults([])
    setLayer4Screen('selector')
    setAppScreen('layer4')
  }

  async function handleReportCreated(reportRow) {
    setShowNewReportModal(false)
    setFixedPOForReport(null)
    if (pendingPreSelectedExpenseIds.length > 0) {
      await supabase.from('expense_details').update({ report_id: reportRow.id }).in('id', pendingPreSelectedExpenseIds)
      setPendingPreSelectedExpenseIds([])
    }
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
    setVendorBackScreen(null)
  }
  // VendorDetail's onBack when reached via a PR's vendor link — returns to
  // that PR instead of always resetting to the vendor list.
  function closeVendorDetail() {
    const dest = vendorBackScreen
    openVendorList()
    if (dest) setAppScreen(dest)
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

  function openAdvanceList() { setAdvanceSubScreen('list') }
  function openAdvanceForm() { setAdvanceSubScreen('form') }

  function openAuditTrail(poId) {
    setAuditTrailReturnScreen(appScreen)
    setAuditTrailPOId(poId)
    setAppScreen('audit-trail')
  }
  function closeAuditTrail() {
    setAppScreen(auditTrailReturnScreen)
    setAuditTrailPOId(null)
  }

  // Public, no-login entry point for a vendor self-registration link — must
  // be checked before session/login logic runs at all, since a vendor has
  // no team_members account. See VendorInviteModal.jsx (generates the link)
  // and PublicVendorRegister.jsx (the form itself).
  const vendorInviteMatch = window.location.pathname.match(/^\/vendor-register\/(.+)$/)
  if (vendorInviteMatch) return <PublicVendorRegister token={vendorInviteMatch[1]} />

  if (sessionLoading) return null
  if (!user) return <LoginScreen onLogin={handleLogin} />

  const role = user.role
  // Roles that approve PRs at some step but never raise their own (fl,
  // pr_approver, finance) get the approver-facing pending/reviewed view
  // under "Purchase Requests" instead of an always-empty "My Requests"
  // list. Admin can both create and approve, so it keeps "My Requests".
  const isPRApproverOnly = canAccessApprovals(role) && !isObserver(role) && !canCreatePR(role)

  const navItems = [
    { key: 'list',    label: 'Home',              icon: '⊞' },
    // Finance doesn't submit expenses/reports themselves, so their own
    // History (of expense submissions) isn't relevant to them. Expense
    // reporting is "coming soon" for employees during this testing round
    // (Vendor/PR/PO only), so History is hidden for them too rather than
    // linking to a feature that isn't open yet.
    ...(role !== 'finance' && role !== 'employee' ? [{ key: 'history', label: 'History', icon: '☰' }] : []),
    // Finance doesn't file its own expense reports, so it stays excluded
    // here too — but this one is otherwise open to everyone, including
    // employees, since raising a report from what's already been saved is
    // core to what they'd use it for.
    ...(role !== 'finance' ? [{ key: 'my-expenses', label: 'My Expenses', icon: '🧾' }] : []),
    ...(canAccessApprovals(role) ? [{ key: 'approvals', label: 'Approvals', icon: '✓' }] : []),
    ...(canAccessFinance(role)   ? [{ key: 'finance',   label: 'Finance',   icon: '₹' }] : []),
    { key: 'advances', label: 'Advances', icon: '⏱' },
    { key: 'pr-list', label: 'Purchase Requests',  icon: '◫' },
    { key: 'po-list', label: 'Purchase Orders',    icon: '◻' },
    { key: 'vendors', label: canAccessFinance(role) ? 'Vendor Management' : 'Vendors', icon: '⬡' },
    // Everyone gets Settings now — admins see Team & Roles plus their own
    // profile there; everyone else just sees their own read-only profile.
    // Admin-only system-wide timeline — separate from the per-PO 'Audit Trail'
    // document chain, which stays reachable only from a PO's own page.
    ...(role === 'admin' ? [{ key: 'activity-log', label: 'Activity Log', icon: '☷' }] : []),
    { key: 'settings', label: 'Settings', icon: '⚙' },
  ]

  const activeNav = SCREEN_PARENT[appScreen] || appScreen
  const moduleName = navItems.find(n => n.key === activeNav)?.label || appScreen

  function handleNavClick(key) {
    if (key === 'vendors') openVendorList()
    if (key === 'pr-list') openPRList()
    if (key === 'po-list') openPOList()
    if (key === 'advances') openAdvanceList()
    // FinanceDashboard keeps its own drill-down state internally (tab,
    // vendor sub-screens, etc.) — App has nothing to reset directly, and
    // re-clicking "Finance" while already on it is a same-value setAppScreen
    // no-op (React bails the render). Bumping this key forces a full
    // remount, resetting all of FinanceDashboard's internal state for free.
    if (key === 'finance' && appScreen === 'finance') setFinanceResetKey(k => k + 1)
    setAppScreen(key)
    if (isMobile) setSidebarOpen(false)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--taupe-50)' }}>

      {/* Backdrop — closes the drawer on outside click, mobile only */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 49 }}
        />
      )}

      {/* ── Left sidebar — a slide-out drawer on mobile, always visible on desktop ── */}
      <div style={{
        width: sbW,
        minHeight: '100vh',
        background: 'var(--surface-hot)',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        boxShadow: '2px 0 12px rgba(140,50,37,0.25)',
        transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: 'transform 0.2s ease, width 0.2s ease',
        overflowX: 'hidden',
      }}>
        {/* Logo + fold/unfold */}
        <div style={{
          padding: rail ? '16px 0' : '22px 14px 18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'space-between', gap: '8px',
        }}>
          {!rail && (
            <div style={{ minWidth: 0 }}>
              <img src={wordmarkLogo} alt="The/Nudge" style={{ height: '20px', width: 'auto', display: 'block' }} />
              <div style={{ fontSize: '10px', color: 'var(--text-on-dark-muted)', marginTop: '8px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                Expense Tracker
              </div>
            </div>
          )}
          {!isMobile && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
              title={rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
              style={{
                flexShrink: 0, padding: '4px', background: 'transparent', cursor: 'pointer',
                border: 'none', borderRadius: 'var(--radius-sm)', outlineOffset: '2px',
                color: 'var(--text-on-dark-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0.85,
              }}
            >
              <SidebarToggleIcon collapsed={rail} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav" style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {navItems.map(({ key, label, icon }) => {
            const active = activeNav === key
            return (
              <div
                key={key}
                data-tour-anchor={key === 'pr-list' ? 'pr-nav' : undefined}
                onClick={() => handleNavClick(key)}
                title={rail ? label : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  justifyContent: rail ? 'center' : 'flex-start',
                  padding: rail ? '12px 0' : '10px 16px 10px 17px',
                  cursor: 'pointer',
                  borderLeft: active ? '3px solid #E8A090' : '3px solid transparent',
                  background: active ? 'rgba(140,50,37,0.25)' : 'transparent',
                  color: active ? 'var(--surface-card)' : 'var(--text-on-dark-muted)',
                  fontSize: '13px', fontWeight: active ? 600 : 400,
                  transition: 'all 0.1s',
                  userSelect: 'none',
                }}
              >
                <span style={{ minWidth: '20px', display: 'flex', justifyContent: 'center', opacity: active ? 1 : 0.75 }}>
                  <NavIcon name={key} size={rail ? 20 : 18} fallback={icon} />
                </span>
                {!rail && label}
              </div>
            )
          })}

          {user.role !== 'employee' && (
            <>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />

              <div
                onClick={() => { handleAddAnother(); if (isMobile) setSidebarOpen(false) }}
                title={rail ? 'New Expense' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  justifyContent: rail ? 'center' : 'flex-start',
                  padding: rail ? '12px 0' : '9px 16px 9px 17px', cursor: 'pointer',
                  color: '#E8A090', fontSize: '13px', fontWeight: 600,
                  userSelect: 'none',
                }}
              >
                <span style={{ minWidth: '20px', display: 'flex', justifyContent: 'center' }}>
                  <NavIcon name="new-expense" size={rail ? 20 : 18} />
                </span>
                {!rail && 'New Expense'}
              </div>
              <div
                onClick={() => { handleNewReport(); if (isMobile) setSidebarOpen(false) }}
                title={rail ? 'New Report' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  justifyContent: rail ? 'center' : 'flex-start',
                  padding: rail ? '12px 0' : '9px 16px 9px 17px', cursor: 'pointer',
                  color: 'var(--text-on-dark-muted)', fontSize: '13px',
                  userSelect: 'none',
                }}
              >
                <span style={{ minWidth: '20px', display: 'flex', justifyContent: 'center', opacity: 0.75 }}>
                  <NavIcon name="new-report" size={rail ? 20 : 18} />
                </span>
                {!rail && 'New Report'}
              </div>
            </>
          )}
        </nav>

        {/* User info + sign out */}
        <div style={{ padding: rail ? '12px 0' : '14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <NotificationBell
            user={user}
            compact={rail}
            onOpenReport={handleViewReport}
            onOpenPR={(id) => { setAppScreen('pr-list'); openPRDetail(id) }}
            onOpenVendor={(id) => { setAppScreen('vendors'); openVendorDetail(id) }}
            onOpenPO={(id) => { setAppScreen('po-list'); openPODetail(id) }}
          />
          {rail ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={handleReplayWalkthrough}
                aria-label="Help"
                title="Help — replay the guided tour"
                style={{
                  width: '34px', height: '28px', flexShrink: 0, padding: 0,
                  background: 'transparent', border: '1px solid rgba(196,130,111,0.35)',
                  color: 'var(--text-on-dark-muted)', borderRadius: 'var(--radius-md)',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ?
              </button>
              <LanguageToggle tone="dark" style={{ minWidth: '34px', width: '34px', height: '28px', padding: 0, fontSize: '11px', flexShrink: 0 }} />
              <button
                onClick={handleSignOut}
                aria-label="Sign out"
                title={`Sign out (${user.name})`}
                style={{
                  width: '34px', height: '28px', padding: 0,
                  background: 'transparent', border: '1px solid rgba(196,130,111,0.35)',
                  color: 'var(--text-on-dark-muted)', borderRadius: 'var(--radius-md)',
                  fontSize: '14px', cursor: 'pointer',
                }}
              >
                ⎋
              </button>
            </div>
          ) : (
            <>
              {/* Name + role on the left; Help and language as small icon buttons
                  on the same line, so the footer stays just this row + Sign out. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px', fontWeight: 600, color: 'var(--surface-card)',
                    marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-on-dark-muted)' }}>
                    {user.roleLabel}
                  </div>
                </div>
                <button
                  onClick={handleReplayWalkthrough}
                  aria-label="Help"
                  title="Help — replay the guided tour"
                  style={{
                    width: '28px', height: '28px', flexShrink: 0, padding: 0,
                    background: 'transparent', border: '1px solid rgba(196,130,111,0.35)',
                    color: 'var(--text-on-dark-muted)', borderRadius: 'var(--radius-md)',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ?
                </button>
                <LanguageToggle tone="dark" style={{ minWidth: '34px', width: '34px', height: '28px', padding: 0, fontSize: '11px', flexShrink: 0 }} />
              </div>
              <button
                onClick={handleSignOut}
                style={{
                  width: '100%', padding: '6px 0',
                  background: 'transparent',
                  border: '1px solid rgba(196,130,111,0.35)',
                  color: 'var(--text-on-dark-muted)', borderRadius: 'var(--radius-md)',
                  fontSize: '11px', cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>

      <FirstTimeWalkthrough open={walkthroughOpen} onClose={() => setWalkthroughOpen(false)} />

      {/* ── Main content ── */}
      <div style={{ marginLeft: isMobile ? 0 : sbW, transition: 'margin-left 0.2s ease', flex: 1, minHeight: '100vh', overflowX: 'hidden', width: '100%', boxSizing: 'border-box' }}>
        {isMobile && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 30,
            display: 'flex', alignItems: 'center', gap: '12px',
            height: '52px', padding: '0 16px',
            background: 'var(--surface-hot)', boxShadow: '0 1px 6px rgba(140,50,37,0.2)',
          }}>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                width: '32px', height: '32px', border: 'none', background: 'transparent',
                color: 'var(--surface-card)', fontSize: '20px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              ☰
            </button>
            <img src={wordmarkLogo} alt="The/Nudge" style={{ height: '16px', width: 'auto', display: 'block' }} />
          </div>
        )}
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
          <div style={{ maxWidth: layer1Data?.capture_id ? '1040px' : '520px', margin: '0 auto', padding: '32px 24px' }}>
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
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink)' }}>
                Hello, {user.name.split(' ')[0]} 👋
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {user.roleLabel} · {user.email}
              </div>
            </div>

            <div data-tour-anchor="quick-add" style={{ background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '28px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '16px' }}>Quick Add</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '14px' }}>
                <QuickAddDropzone onReady={handleQuickReceipt} />

                <div
                  onClick={handleAddAnother}
                  style={{
                    border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: '28px 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', minHeight: '148px', boxSizing: 'border-box', textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: 'var(--action-bg)',
                    color: 'var(--action)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: 700, marginBottom: '10px',
                  }}>
                    +
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>New Expense</div>
                </div>

                <div
                  onClick={handleNewReport}
                  style={{
                    border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', padding: '28px 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', minHeight: '148px', boxSizing: 'border-box', textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: 'var(--action-bg)',
                    color: 'var(--action)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', marginBottom: '10px',
                  }}>
                    ◷
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>New Report</div>
                </div>
              </div>
            </div>

            <HomeScreenAddons
              user={user}
              onViewReport={handleViewReport}
              onResumePRDraft={(id) => { setAppScreen('pr-list'); openPRDraftEdit(id) }}
              onResumeVendorDraft={(id) => { setAppScreen('vendors'); openDraftEdit(id) }}
              onOpenExpenseApprovals={() => { setApprovalsTab('expenses'); setAppScreen('approvals') }}
              onOpenPRApprovals={() => { setApprovalsTab('prs'); setAppScreen('approvals') }}
              onOpenFinance={() => setAppScreen('finance')}
              onViewPR={(id) => { setAppScreen('pr-list'); openPRDetail(id) }}
              onViewVendor={(id) => { setAppScreen('vendors'); openVendorDetail(id) }}
              onOpenReportApproval={(id) => { setApprovalReportId(id); setAppScreen('approval-view') }}
            />
          </div>
        )}

        {appScreen === 'layer4' && layer4Screen === 'selector' && (
          <ExpenseSelector
            expenses={layer4Expenses}
            results={layer4Results}
            user={user}
            reportMeta={newReportMeta}
            onPreview={handleSelectionContinue}
            onBack={() => setAppScreen('list')}
          />
        )}

        {appScreen === 'layer4' && layer4Screen === 'workspace' && (
          <ReportWorkspace
            reportMeta={newReportMeta}
            expenses={selectedExpenses}
            user={user}
            onBack={() => setLayer4Screen('selector')}
            onPreview={handleWorkspacePreview}
          />
        )}

        {appScreen === 'layer4' && layer4Screen === 'preview' && (
          <ReportPreview
            expenses={selectedExpenses}
            results={selectedResults}
            reportDetails={layer4ReportDetails}
            user={user}
            onSubmitted={handleLayer4Submitted}
            onBack={() => setLayer4Screen('workspace')}
          />
        )}

        {showNewReportModal && (
          <NewReportModal
            user={user}
            fixedPO={fixedPOForReport}
            onCreated={handleReportCreated}
            onClose={() => { setShowNewReportModal(false); setPendingPreSelectedExpenseIds([]); setFixedPOForReport(null) }}
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
            onEditRejected={handleEditRejected}
            onViewPO={(id) => { setAppScreen('po-list'); openPODetail(id) }}
          />
        )}

        {/* ── Approvals hub ── */}
        {appScreen === 'approvals' && (
          <div>
            <div style={{
              display: 'flex', padding: '0 24px',
              background: 'var(--surface-card)', borderBottom: '1px solid var(--taupe-200)',
            }}>
              {[['expenses', 'Expense Reports'], ['prs', 'Purchase Requests'], ['advances', 'Advances']].map(([key, label]) => (
                <div
                  key={key}
                  onClick={() => setApprovalsTab(key)}
                  style={{
                    padding: '14px 16px', fontSize: '13px', cursor: 'pointer',
                    fontWeight: approvalsTab === key ? 600 : 400,
                    color: approvalsTab === key ? 'var(--text)' : 'var(--text-muted)',
                    borderBottom: approvalsTab === key ? '2px solid var(--action)' : '2px solid transparent',
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
            {approvalsTab === 'advances' && (
              <AdvanceApproverDashboard
                onViewAdvance={(advance) => { setApprovingAdvance(advance); setAppScreen('advance-approval-view') }}
              />
            )}
          </div>
        )}

        {appScreen === 'approval-view' && (
          <ApproverReportView
            reportId={approvalReportId}
            user={user}
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
            onViewVendor={(id) => { setVendorBackScreen('pr-approval-view'); setAppScreen('vendors'); openVendorDetail(id) }}
            onViewPO={(id) => { setAppScreen('po-list'); openPODetail(id) }}
            showToast={showToast}
            backLabel="PR Approvals"
          />
        )}

        {appScreen === 'advance-approval-view' && (
          <AdvanceApprovalView
            advance={approvingAdvance}
            user={user}
            onBack={() => setAppScreen('approvals')}
            onActioned={(action) => {
              showToast(`Advance ${action}.`, action === 'approved' ? 'approved' : 'rejected')
              setAppScreen('approvals')
            }}
          />
        )}

        {appScreen === 'finance' && (
          <FinanceDashboard key={financeResetKey} user={user} showToast={showToast} onBack={() => setAppScreen('list')} />
        )}

        {appScreen === 'settings' && (
          <SettingsView user={user} />
        )}

        {appScreen === 'activity-log' && (
          <ActivityLog user={user} />
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

        {appScreen === 'my-expenses' && (
          <ExpenseSelector
            user={user}
            standalone
            onRaiseReport={handleRaiseReportFromSelection}
          />
        )}

        {/* ── Advance screens ── */}
        {appScreen === 'advances' && advanceSubScreen === 'list' && (
          <AdvanceList user={user} onCreateAdvance={openAdvanceForm} />
        )}
        {appScreen === 'advances' && advanceSubScreen === 'form' && (
          <AdvanceForm
            user={user}
            onSaved={() => {
              showToast('Advance request submitted.', 'info')
              openAdvanceList()
            }}
            onBack={openAdvanceList}
          />
        )}

        {/* ── Vendor screens ── */}
        {appScreen === 'vendors' && vendorSubScreen === 'list' && (
          <VendorList user={user} onViewVendor={openVendorDetail} onCreateVendor={openVendorCreate} onResumeDraft={openDraftEdit} />
        )}
        {appScreen === 'vendors' && vendorSubScreen === 'search' && (
          <VendorSearch onCreateNew={openVendorForm} onSelectExisting={(v) => openVendorDetail(v.id)} onBack={openVendorList} />
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
            onBack={closeVendorDetail}
            backLabel={vendorBackScreen ? 'Back to Purchase Request' : 'Vendors'}
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
          <PODetail poId={viewingPOId} user={user} onBack={openPOList} onViewAuditTrail={openAuditTrail} onRaiseReportFromPO={handleRaiseReportFromPO} />
        )}

        {/* ── Audit trail (admin only) ── */}
        {appScreen === 'audit-trail' && (
          <AuditTrail
            poId={auditTrailPOId}
            user={user}
            onBack={closeAuditTrail}
            onViewVendor={(id) => { setAppScreen('vendors'); openVendorDetail(id) }}
            onViewPR={(id) => { setAppScreen('pr-list'); openPRDetail(id) }}
            onViewPO={(id) => { setAppScreen('po-list'); openPODetail(id) }}
            onViewReport={() => setAppScreen('finance')}
          />
        )}

        {/* ── PR screens ── */}
        {appScreen === 'pr-list' && prSubScreen === 'list' && (
          isPRApproverOnly
            ? <PRApproverDashboard onViewPR={openPRDetail} />
            : <PRList user={user} onViewPR={openPRDetail} onCreatePR={openPRCreate} onResumeDraft={openPRDraftEdit} />
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
            onViewVendor={(id) => { setVendorBackScreen('pr-list'); setAppScreen('vendors'); openVendorDetail(id) }}
            onViewPO={(id) => { setAppScreen('po-list'); openPODetail(id) }}
            showToast={showToast}
          />
        )}
      </div>

      <FeedbackWidget user={user} moduleName={moduleName} />
    </div>
  )
}
