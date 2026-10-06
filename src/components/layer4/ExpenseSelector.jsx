import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ExpenseDetails from '../layer2/ExpenseDetails'
import QuickAddDropzone from '../capture/QuickAddDropzone'
import { insertExpenseDetails, buildQuickSaveExpensePayload, isExpenseComplete } from '../../lib/expenseDetailsSave'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useFormTour } from '../../hooks/useFormTour'
import GuidedTour, { TourButton } from '../shared/GuidedTour'
import { REPORT_TOUR } from '../../lib/tours'
import RejectionBanner from './RejectionBanner'

export default function ExpenseSelector({ expenses: initialExpenses, results: initialResults, user, reportMeta, onPreview, onBack, standalone, onRaiseReport }) {
  const isMobile = useIsMobile()
  const [expenses, setExpenses] = useState(initialExpenses || [])
  const [loading, setLoading] = useState(!initialExpenses || initialExpenses.length === 0)
  const [selected, setSelected] = useState(new Set())
  const [grouped, setGrouped] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  // Closed until someone clicks "+ Add expense" — an always-open drop box in
  // the middle of the page made people unsure whether they had to use it.
  const [showAddPanel, setShowAddPanel] = useState(false)
  // The expense-report tour only makes sense inside a report's own workspace.
  const tour = useFormTour('report', { enabled: !!reportMeta })
  const [newLayer1Data, setNewLayer1Data] = useState(null)
  const [addingNew, setAddingNew] = useState(false)
  const [thumbnails, setThumbnails] = useState({}) // expense id -> signed image url

  const results = initialResults || []

  // Any expense already tagged with this draft report (dropped in directly
  // from this screen, or linked via the Report dropdown elsewhere) shows up
  // pre-selected — matches Zoho's behaviour where a receipt dropped onto a
  // report's own page is already "in" that report, no extra click needed.
  useEffect(() => {
    if (!reportMeta?.id) return
    const linkedIds = expenses.filter(e => e.report_id === reportMeta.id).map(e => e.id)
    if (linkedIds.length === 0) return
    setSelected(prev => {
      const next = new Set(prev)
      linkedIds.forEach(id => next.add(id))
      return next
    })
  }, [expenses, reportMeta?.id])

  function refetch() {
    return supabase
      .from('expense_details')
      .select('*')
      .in('user_email', user?.ownEmails ?? [])
      .in('status', ['saved', 'flagged'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setExpenses(data || []))
  }

  useEffect(() => {
    if (!initialExpenses || initialExpenses.length === 0) {
      refetch().then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Batch-fetch one thumbnail per expense (its receipt, falling back to its
  // payment proof) — one query for the linked expense_captures rows, then
  // one batched signed-URL call, rather than a request per row.
  useEffect(() => {
    async function loadThumbnails() {
      const captureIds = [...new Set(expenses.map(e => e.capture_id).filter(Boolean))]
      if (captureIds.length === 0) { setThumbnails({}); return }
      const { data: captures } = await supabase
        .from('expense_captures')
        .select('id, receipt_storage_path, payment_storage_path')
        .in('id', captureIds)
      const pathByCaptureId = {}
      const allPaths = []
      ;(captures || []).forEach(c => {
        const path = c.receipt_storage_path || c.payment_storage_path
        if (path) { pathByCaptureId[c.id] = path; allPaths.push(path) }
      })
      if (allPaths.length === 0) { setThumbnails({}); return }
      const { data: signed } = await supabase.storage.from('expense-documents').createSignedUrls(allPaths, 3600)
      const urlByPath = {}
      ;(signed || []).forEach(s => { if (s?.signedUrl) urlByPath[s.path] = s.signedUrl })
      const map = {}
      expenses.forEach(e => {
        const path = e.capture_id ? pathByCaptureId[e.capture_id] : null
        if (path && urlByPath[path]) map[e.id] = urlByPath[path]
      })
      setThumbnails(map)
    }
    loadThumbnails()
  }, [expenses])

  // A receipt dropped inside a report is saved straight away as an expense in
  // this report (details still to come) — it shows up ticked in the list below
  // and its details are filled in on the next screen.
  async function quickAddReceipt(data) {
    const { error } = await insertExpenseDetails({
      payload: { ...buildQuickSaveExpensePayload(data), report_id: reportMeta.id },
      captureId: data.capture_id,
      userEmail: user?.email,
    })
    if (error) throw error
    await refetch()
  }

  function handleExpenseSaved() {
    setEditingExpense(null)
    setAddingNew(false)
    setNewLayer1Data(null)
    setShowAddPanel(false)
    refetch()
  }

  // Policy violations are advisory (see PolicyResult.jsx) — they never prevent
  // an expense from being selected. Only a persisted hard block from Finance
  // (policy_status === 'blocked') actually stops selection.
  const blockedIds = new Set()
  const violatedIds = new Set()
  expenses.forEach((exp, i) => {
    const r = results[i]
    if (r && r.violations && r.violations.length > 0) violatedIds.add(exp.id)
    if (exp.policy_status === 'blocked') blockedIds.add(exp.id)
  })
  // A "Save expense, finish details later" quick-save row has no entity
  // set yet — it can't be validly included in a report until someone opens
  // it and fills in the rest, so it's shown but not selectable.
  // Inside a report's own workspace those rows are selectable though — the
  // details get filled in on the next screen, next to the receipts.
  const inReport = !!reportMeta
  const incompleteIds = new Set(inReport ? [] : expenses.filter(e => e.entity == null).map(e => e.id))

  function getViolationMessage(expId) {
    const idx = expenses.findIndex(e => e.id === expId)
    if (idx === -1) return null
    const r = results[idx]
    if (r && r.violations && r.violations.length > 0) return r.violations[0].message
    return null
  }

  function getPolicyBadge(exp, i) {
    if (blockedIds.has(exp.id) || violatedIds.has(exp.id)) return { label: 'Issue', color: 'var(--clay-text)', bg: 'var(--clay-bg)' }
    const r = results[i]
    if (r && r.flags && r.flags.filter(f => !f.internalOnly).length > 0) {
      return { label: 'Flagged', color: 'var(--gold-text)', bg: 'var(--gold-bg)' }
    }
    if (exp.policy_status === 'flagged') return { label: 'Flagged', color: 'var(--gold-text)', bg: 'var(--gold-bg)' }
    return { label: 'Passed', color: 'var(--moss)', bg: 'var(--moss-bg)' }
  }

  function toggleSelect(expId) {
    if (blockedIds.has(expId) || incompleteIds.has(expId)) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(expId)) next.delete(expId)
      else next.add(expId)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(expenses.filter(e => !blockedIds.has(e.id) && !incompleteIds.has(e.id)).map(e => e.id)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  function handlePreview() {
    if (selected.size === 0) return
    if (onPreview) {
      const sel = expenses.filter(e => selected.has(e.id))
      const selResults = sel.map(e => {
        const idx = expenses.findIndex(exp => exp.id === e.id)
        return results[idx] || { violations: [], flags: [] }
      })
      onPreview(sel, selResults)
      return
    }
    if (onRaiseReport) onRaiseReport([...selected])
  }

  const selectedExpenses = expenses.filter(e => selected.has(e.id))
  const selectedTotal = selectedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  const selectedReimbursable = selectedExpenses.reduce((sum, e) => sum + (e.reimbursable !== false ? (e.amount || 0) : 0), 0)

  function formatDuration(start, end) {
    if (!start && !end) return null
    const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    return `${fmt(start)} – ${fmt(end)}`
  }

  function getGrouped() {
    const groups = {}
    expenses.forEach(exp => {
      const key = exp.trip_name || 'No trip associated'
      if (!groups[key]) groups[key] = []
      groups[key].push(exp)
    })
    return groups
  }

  function renderRow(exp, globalIndex) {
    const i = globalIndex !== undefined ? globalIndex : expenses.findIndex(e => e.id === exp.id)
    const isBlocked = blockedIds.has(exp.id)
    const isIncomplete = incompleteIds.has(exp.id)
    const hasViolation = violatedIds.has(exp.id)
    const isSelected = selected.has(exp.id)
    // Policy flags are deliberately not shown while choosing expenses for a
    // report — they surface on the final preview instead.
    const needsDetails = inReport && !isExpenseComplete(exp)
    const badge = (isIncomplete || needsDetails)
      ? { label: 'Needs details', color: 'var(--action)', bg: 'var(--action-bg)' }
      : inReport
        ? (isBlocked ? { label: 'Blocked', color: 'var(--clay-text)', bg: 'var(--clay-bg)' } : null)
        : getPolicyBadge(exp, i)
    const violationMsg = (!inReport && (isBlocked || hasViolation)) ? getViolationMessage(exp.id) : null
    const thumb = thumbnails[exp.id]

    return (
      <div key={exp.id}>
        <div
          onClick={() => (isIncomplete ? setEditingExpense(exp) : toggleSelect(exp.id))}
          style={{
            display: 'flex', alignItems: 'center', padding: '16px', minHeight: '72px',
            borderBottom: '1px solid var(--taupe-200)',
            cursor: isBlocked ? 'default' : 'pointer',
            opacity: isBlocked ? 0.5 : 1,
            background: 'var(--surface-card)',
          }}
        >
          {/* Checkbox */}
          <div style={{
            width: '20px', height: '20px', flexShrink: 0,
            border: `1.5px solid ${isSelected ? 'var(--text)' : 'var(--taupe-200)'}`,
            background: isSelected ? 'var(--text)' : 'var(--surface-card)',
            marginRight: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-xs)',
            pointerEvents: (isBlocked || isIncomplete) ? 'none' : 'auto',
            opacity: isIncomplete ? 0.4 : 1,
          }}>
            {isSelected && (
              <div style={{
                width: '10px', height: '6px',
                borderLeft: '2px solid var(--surface-card)', borderBottom: '2px solid var(--surface-card)',
                transform: 'rotate(-45deg)', marginTop: '-3px',
              }} />
            )}
          </div>

          {/* Thumbnail */}
          <div style={{
            width: '40px', height: '40px', flexShrink: 0, marginRight: '12px',
            borderRadius: 'var(--radius-xs)', overflow: 'hidden',
            border: '1px solid var(--taupe-200)', background: 'var(--taupe-50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {thumb ? (
              <img src={thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>📄</span>
            )}
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '12px' }}>
                {exp.vendor || 'Unknown vendor'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}>
                {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {[exp.category, exp.date].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                {badge && (
                  <div style={{
                    fontSize: '11px', fontWeight: 500,
                    padding: '2px 8px', borderRadius: 'var(--radius-xs)',
                    background: badge.bg, color: badge.color,
                  }}>
                    {badge.label}
                  </div>
                )}
                {!isIncomplete && (
                  <span
                    onClick={e => { e.stopPropagation(); setEditingExpense(exp) }}
                    style={{ fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    Edit
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {violationMsg && (
          <div style={{
            fontSize: '11px', color: 'var(--clay-text)',
            padding: '6px 16px 8px 52px',
            background: 'var(--clay-bg)',
            borderBottom: '1px solid var(--taupe-200)',
            lineHeight: '1.4',
          }}>
            {isBlocked ? 'Cannot be included — ' : 'Policy note — '}{violationMsg}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading expenses...</div>
      </div>
    )
  }

  const groupedData = grouped ? getGrouped() : null

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%', paddingBottom: '80px' }}>
      {onBack && (
        <div style={{ padding: '20px 20px 0' }}>
          <div
            onClick={onBack}
            style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', marginBottom: '4px' }}
          >
            ← Back
          </div>
        </div>
      )}
      {/* Report workspace header — this draft report's own page */}
      {reportMeta && (
        <div style={{ padding: '20px 20px 0' }}>
          <RejectionBanner report={reportMeta} />
          <div style={{ border: '1px solid var(--taupe-200)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--taupe-200)' }}>
              <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text)' }}>{reportMeta.report_reference}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-xs)', background: 'var(--taupe-50)', color: 'var(--text-muted)', letterSpacing: '0.03em' }}>
                {(reportMeta.status || 'draft').toUpperCase()}
              </span>
              {formatDuration(reportMeta.duration_start, reportMeta.duration_end) && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {formatDuration(reportMeta.duration_start, reportMeta.duration_end)}
                </span>
              )}
            </div>
            {reportMeta.business_purpose && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Business Purpose</div>
                <div style={{ fontSize: '13px', color: 'var(--text)' }}>{reportMeta.business_purpose}</div>
              </div>
            )}
            <div style={{ display: 'flex' }}>
              <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid var(--taupe-200)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Total</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>₹{selectedTotal.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ flex: 1, padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Amount to be Reimbursed</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>₹{selectedReimbursable.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{reportMeta ? 'Add expenses to this report' : standalone ? 'My Expenses' : 'Create Report'}</span>
          {reportMeta && <TourButton onClick={tour.start} />}
          {reportMeta && <GuidedTour steps={REPORT_TOUR} open={tour.open} onClose={tour.close} tourKey="report" />}
        </div>
        <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)', marginBottom: '8px' }}>
          {reportMeta ? 'Pick from your saved expenses, or add a new one' : standalone ? 'Browse and select your saved expenses' : 'Select expenses to include'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
          {reportMeta
            ? "Tick the expenses to include in this report. Saved a receipt without filing it? Tick it here. Have a new one? Click + Add expense and drop in the receipts. You'll fill in any missing details on the next screen."
            : standalone
              ? 'Everything you’ve saved but not yet included in a report. Select one or more to raise a report, or just browse.'
              : 'Choose which expenses to include in this report. You can create multiple reports from your saved expenses.'}
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <span onClick={selectAll} style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'underline', cursor: 'pointer' }}>
            Select all
          </span>
          <span onClick={clearAll} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer' }}>
            Clear all
          </span>
          <button
            type="button"
            data-tour-anchor="er-add"
            onClick={() => setShowAddPanel(s => !s)}
            style={{
              marginLeft: 'auto', height: '32px', padding: '0 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--action)',
              background: showAddPanel ? 'var(--action-bg)' : 'var(--surface-card)', color: 'var(--action)',
            }}
          >
            {showAddPanel ? '× Close' : '+ Add expense'}
          </button>
        </div>

        {showAddPanel && (
          <div style={{ marginBottom: '16px' }}>
            <QuickAddDropzone multiple onReady={quickAddReceipt} />
            <div
              onClick={() => { setNewLayer1Data(null); setAddingNew(true) }}
              style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer', marginTop: '10px' }}
            >
              or enter details manually
            </div>
          </div>
        )}
      </div>

      {/* Expense list */}
      <div data-tour-anchor="er-list" style={{ borderTop: '1px solid var(--taupe-200)', borderBottom: '1px solid var(--taupe-200)' }}>
        {!grouped && expenses.map((exp, i) => renderRow(exp, i))}
        {grouped && Object.entries(groupedData).map(([group, exps]) => (
          <div key={group}>
            <div style={{
              fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
              background: 'var(--taupe-50)', padding: '8px 16px',
              borderBottom: '1px solid var(--taupe-200)',
            }}>
              {group}
            </div>
            {exps.map(exp => renderRow(exp))}
          </div>
        ))}
      </div>

      {/* Group toggle */}
      <div style={{ padding: '16px 20px' }}>
        <div
          onClick={() => setGrouped(g => !g)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <div style={{
            width: '36px', height: '20px', borderRadius: 'var(--radius-lg)',
            background: grouped ? 'var(--text)' : 'var(--taupe-200)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '50%', background: 'var(--surface-card)',
              position: 'absolute', top: '2px',
              left: grouped ? '18px' : '2px',
              transition: 'left 0.2s',
            }} />
          </div>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Group by trip or project</span>
        </div>
      </div>

      {/* Multiple reports note */}
      {expenses.length > 5 && (
        <div style={{ margin: '0 20px 16px', padding: '12px', background: 'var(--taupe-50)', border: '1px solid var(--taupe-200)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            You have {expenses.length} saved expenses. You can create multiple reports — select a subset now and create another report later for the rest.
          </div>
        </div>
      )}

      {/* Fixed bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: isMobile ? 0 : '220px', right: 0,
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: '480px', margin: '0 auto',
          background: 'var(--surface-card)', borderTop: '1px solid var(--taupe-200)',
          padding: '16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {selected.size} selected · ₹{selectedTotal.toLocaleString('en-IN')}
          </div>
          <button
            type="button"
            data-tour-anchor="er-preview"
            onClick={handlePreview}
            disabled={selected.size === 0}
            style={{
              height: '44px', padding: '0 24px', border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap',
              background: selected.size > 0 ? 'var(--action)' : 'var(--taupe-200)',
              color: selected.size > 0 ? 'var(--surface-card)' : 'var(--text-muted)',
              cursor: selected.size > 0 ? 'pointer' : 'default',
            }}
          >
            {onPreview ? 'Continue to report →' : 'Raise report →'}
          </button>
        </div>
      </div>

      {/* Edit an existing expense in place */}
      {editingExpense && (
        <div
          onClick={() => setEditingExpense(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 100, overflowY: 'auto' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface-card)', minHeight: '100vh' }}>
            <ExpenseDetails
              existingExpense={editingExpense}
              user={user}
              onSaved={handleExpenseSaved}
              onBack={() => setEditingExpense(null)}
            />
          </div>
        </div>
      )}

      {/* Add a new expense without leaving report creation */}
      {addingNew && (
        <div
          onClick={() => setAddingNew(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.5)', zIndex: 100, overflowY: 'auto' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface-card)', minHeight: '100vh' }}>
            <ExpenseDetails
              layer1Data={newLayer1Data}
              defaultReportId={reportMeta?.id}
              reportPO={reportMeta ? { related: reportMeta.po_related, poId: reportMeta.po_id } : null}
              user={user}
              onSaved={handleExpenseSaved}
              onBack={() => setAddingNew(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
