import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { runAllChecks } from '../../lib/policyEngine'
import { isExpenseComplete } from '../../lib/expenseDetailsSave'
import ExpenseDetails from '../layer2/ExpenseDetails'
import VoiceInputButton from '../shared/VoiceInputButton'
import { useIsMobile } from '../../hooks/useIsMobile'
import RejectionBanner from './RejectionBanner'

const isPdf = path => /\.pdf($|\?)/i.test(path || '')

// Expense dates are stored as free text (dd/mm/yyyy, dd-mm-yyyy or ISO) —
// turn one into yyyy-mm-dd for a date input, or '' if it can't be read.
function toISODate(str) {
  if (!str) return ''
  let d = null
  const dm = String(str).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dm) d = new Date(parseInt(dm[3]), parseInt(dm[2]) - 1, parseInt(dm[1]))
  else { const t = new Date(str); if (!isNaN(t.getTime())) d = t }
  if (!d) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function ReceiptBlock({ expense, docs, index }) {
  return (
    <div id={`rcpt-${expense.id}`} style={{ marginBottom: '20px', scrollMarginTop: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
          {index + 1}. {expense.vendor || 'Unknown vendor'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
          {expense.amount ? `₹${Number(expense.amount).toLocaleString('en-IN')}` : '—'}
        </div>
      </div>
      {docs == null && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading receipt…</div>}
      {docs && docs.length === 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', border: '1px dashed var(--taupe-200)', padding: '14px', textAlign: 'center' }}>
          No receipt attached to this expense
        </div>
      )}
      {(docs || []).map(d => (
        <div key={d.path} style={{ marginBottom: '10px' }}>
          {docs.length > 1 && (
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{d.label}</div>
          )}
          {isPdf(d.path) ? (
            <iframe title={`${expense.vendor} ${d.label}`} src={d.url} style={{ width: '100%', height: '60vh', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)' }} />
          ) : (
            <a href={d.url} target="_blank" rel="noopener noreferrer">
              <img src={d.url} alt={`${expense.vendor || 'Expense'} ${d.label}`} style={{ width: '100%', display: 'block', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)' }} />
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// Step after choosing expenses: every chosen receipt together on the left,
// the details still to be filled in on the right. Once everything is ready
// it goes straight to the report preview.
export default function ReportWorkspace({ reportMeta, expenses: initialRows, user, onBack, onPreview }) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState(initialRows)
  const [docsByExpense, setDocsByExpense] = useState({}) // id -> [{label,url,path}]
  const [purpose, setPurpose] = useState(reportMeta?.business_purpose || '')
  // Duration comes from the dates read off the receipts (earliest to latest),
  // and stays blank when no receipt date could be read — the employee then
  // fills it in themselves. Dates they already confirmed earlier in this same
  // flow (coming back from the preview) are kept.
  const derivedDates = initialRows.map(e => toISODate(e.date)).filter(Boolean).sort()
  const keepSaved = !!reportMeta?._durationConfirmed
  const [durStart, setDurStart] = useState(keepSaved ? (reportMeta.duration_start || '') : (derivedDates[0] || ''))
  const [durEnd, setDurEnd] = useState(keepSaved ? (reportMeta.duration_end || '') : (derivedDates[derivedDates.length - 1] || ''))
  // 'report' = purpose and duration; 'expenses' = the per-expense forms.
  const [step, setStep] = useState('report')
  const [openId, setOpenId] = useState(() => initialRows.find(e => !isExpenseComplete(e))?.id || null)
  const [showReceipts, setShowReceipts] = useState(false)
  // Live state reported by each open expense form: which mandatory fields are
  // still empty, and the headline values for its collapsed card. Rows whose
  // form isn't open fall back to what is saved.
  const [liveById, setLiveById] = useState({}) // id -> { missing: [], vendor, amount, category, date }
  const pendingSaves = useRef(new Set())
  const trackSave = useCallback(p => {
    const tracked = Promise.resolve(p).catch(() => {})
    pendingSaves.current.add(tracked)
    tracked.finally(() => pendingSaves.current.delete(tracked))
  }, [])
  const handleStatus = useCallback((id, missing, live) => {
    setLiveById(prev => {
      const cur = prev[id]
      if (cur && cur.missing.join('|') === missing.join('|') && cur.vendor === live.vendor && cur.amount === live.amount && cur.category === live.category && cur.date === live.date) return prev
      return { ...prev, [id]: { missing, ...live } }
    })
  }, [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // One batched lookup for every receipt and payment proof.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const captureIds = [...new Set(rows.map(e => e.capture_id).filter(Boolean))]
      const { data: captures } = captureIds.length
        ? await supabase.from('expense_captures').select('id, receipt_storage_path, payment_storage_path').in('id', captureIds)
        : { data: [] }
      const byCapture = {}
      const paths = []
      ;(captures || []).forEach(c => {
        byCapture[c.id] = [['Receipt', c.receipt_storage_path], ['Payment proof', c.payment_storage_path]].filter(([, p]) => p)
        byCapture[c.id].forEach(([, p]) => paths.push(p))
      })
      const urlByPath = {}
      if (paths.length) {
        const { data: signed } = await supabase.storage.from('expense-documents').createSignedUrls(paths, 3600)
        ;(signed || []).forEach(s => { if (s?.signedUrl) urlByPath[s.path] = s.signedUrl })
      }
      const out = {}
      rows.forEach(e => {
        out[e.id] = (byCapture[e.capture_id] || []).filter(([, p]) => urlByPath[p]).map(([label, p]) => ({ label, path: p, url: urlByPath[p] }))
      })
      if (!cancelled) setDocsByExpense(out)
    }
    load()
    return () => { cancelled = true }
  }, [rows.map(e => e.capture_id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleOpen(id) {
    const next = openId === id ? null : id
    setOpenId(next)
    if (next) {
      setShowReceipts(true)
      setTimeout(() => document.getElementById(`rcpt-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }

  // Mandatory fields still empty for one expense: live from its open form,
  // otherwise from what is saved.
  function missingFor(e) {
    if (liveById[e.id]) return liveById[e.id].missing
    return isExpenseComplete(e) ? [] : ['Details']
  }
  const incomplete = rows.filter(e => missingFor(e).length > 0)
  const total = rows.reduce((s, e) => s + (Number(liveById[e.id]?.amount ?? e.amount) || 0), 0)
  const detailsMissing = !durStart || !durEnd
  const canContinue = !detailsMissing
  const allReady = incomplete.length === 0 && !detailsMissing

  // What is still missing, spelled out per expense. Shown on hover or tap of
  // the Preview button while it is not ready.
  const missingSummary = [
    ...(detailsMissing ? ['Report duration'] : []),
    ...incomplete.map(e => `${liveById[e.id]?.vendor || e.vendor || 'Expense'}: ${missingFor(e).join(', ')}`),
  ].join(' · ')

  async function handlePreview() {
    if (busy) return
    if (!allReady) { setError(`Still to fill in: ${missingSummary}`); return }
    setBusy(true)
    setError(null)
    // Make sure every background save has landed, then check what is actually
    // stored one last time before opening the preview.
    await Promise.all([...pendingSaves.current])
    const { data: fresh } = await supabase.from('expense_details').select('*').in('id', rows.map(e => e.id))
    const freshRows = rows.map(e => (fresh || []).find(f => f.id === e.id) || e)
    const stillIncomplete = freshRows.filter(e => !isExpenseComplete(e))
    if (stillIncomplete.length > 0) {
      setError(`Still to fill in: ${stillIncomplete.map(e => e.vendor || 'Expense').join(', ')}`)
      setBusy(false)
      return
    }
    setRows(freshRows)
    const { error: err } = await supabase.from('expense_reports')
      .update({ business_purpose: purpose || null, duration_start: durStart, duration_end: durEnd })
      .eq('id', reportMeta.id)
    if (err) { setError(`Could not save report details: ${err.message}`); setBusy(false); return }
    const results = await Promise.all(freshRows.map(exp => runAllChecks(exp, freshRows)))
      .catch(() => freshRows.map(() => ({ violations: [], flags: [] })))
    setBusy(false)
    onPreview(freshRows, results, { ...reportMeta, business_purpose: purpose || null, duration_start: durStart, duration_end: durEnd, _durationConfirmed: true })
  }

  const inputStyle = {
    width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: '14px',
    color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--surface-card)', fontFamily: 'inherit',
  }
  const labelStyle = { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }

  const receiptsPanel = (
    <aside
      data-tour-anchor="er-receipts"
      className="no-scrollbar"
      style={{
        flex: '1 1 0', minWidth: 0,
        ...(isMobile ? {} : { position: 'sticky', top: '20px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }),
        background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '16px',
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        All receipts in this report, together. Read details straight off them while you fill in the form.
      </div>
      {rows.map((e, i) => <ReceiptBlock key={e.id} expense={e} docs={docsByExpense[e.id]} index={i} />)}
    </aside>
  )

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '20px 20px 120px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div onClick={() => (step === 'expenses' ? setStep('report') : onBack())} style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>← Back</div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Expense Report</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{reportMeta?.report_reference}</div>
        </div>
      </div>

      <RejectionBanner report={reportMeta} />

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Left — every receipt together */}
        {!isMobile && receiptsPanel}

        {/* Right — the form */}
        <div style={{ flex: isMobile ? '1 1 auto' : '0 1 520px', minWidth: 0, width: isMobile ? '100%' : undefined }}>
          {step === 'report' && (
          <div data-tour-anchor="er-details" style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '16px', marginBottom: '20px', background: 'var(--surface-card)' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '14px' }}>Report details</div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Report name</label>
              <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', background: 'var(--taupe-50)', color: 'var(--text-muted)' }}>
                {reportMeta?.report_reference} — auto-generated
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Business purpose</label>
              <div style={{ position: 'relative' }}>
                <textarea
                  value={purpose}
                  onChange={e => setPurpose(e.target.value.slice(0, 500))}
                  placeholder="What was this spend for? (max 500 characters)"
                  rows={3}
                  style={{ ...inputStyle, height: 'auto', padding: '10px 12px', paddingRight: '40px', resize: 'vertical' }}
                />
                <VoiceInputButton value={purpose} onChange={setPurpose} maxLength={500} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Duration<span style={{ color: 'var(--clay-text)' }}> *</span></label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="date" value={durStart} onChange={e => setDurStart(e.target.value)} style={inputStyle} />
                <input type="date" value={durEnd} onChange={e => setDurEnd(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{durStart && durEnd && derivedDates.length
                ? 'Taken from the dates on your receipts. Change it if the report covers a different period.'
                : 'Enter the period this report covers.'}</div>
            </div>
          </div>
          )}

          {step === 'expenses' && (
          <>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
            Expenses ({rows.length})
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
            {incomplete.length > 0
              ? `${incomplete.length} still need${incomplete.length === 1 ? 's' : ''} details. Open each one and fill in the fields marked *. Anything read from your receipt is pre-filled, so check it against the receipt. Everything saves automatically.`
              : 'All expenses are ready. Anything read from your receipts is pre-filled, so open one to check it against the receipt.'}
          </div>

          <div data-tour-anchor="er-forms">
            {rows.map((e, i) => {
              const ready = missingFor(e).length === 0
              const live = liveById[e.id] || {}
              const open = openId === e.id
              return (
                <div key={e.id} style={{ border: `1px solid ${open ? 'var(--text)' : 'var(--taupe-200)'}`, marginBottom: '10px', background: 'var(--surface-card)' }}>
                  <div onClick={() => toggleOpen(e.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', width: '16px', flexShrink: 0 }}>{i + 1}.</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{live.vendor || e.vendor || 'Unknown vendor'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{[live.category ?? e.category, live.date ?? e.date].filter(Boolean).join(' · ') || 'Details not filled in yet'}</div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}>
                      {(live.amount ?? e.amount) ? `₹${Number(live.amount ?? e.amount).toLocaleString('en-IN')}` : '—'}
                    </div>
                    <div style={{
                      fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-xs)', flexShrink: 0,
                      background: ready ? 'var(--moss-bg)' : 'var(--action-bg)', color: ready ? 'var(--moss)' : 'var(--action)',
                    }}>
                      {ready ? 'Ready' : 'Needs details'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{open ? '▴' : '▾'}</div>
                  </div>
                  {open && (
                    <div style={{ padding: '4px 14px 16px', borderTop: '1px solid var(--taupe-200)', paddingTop: '16px' }}>
                      <ExpenseDetails embedded existingExpense={e} user={user} onStatus={handleStatus} trackSave={trackSave} onSaved={() => {}} onBack={() => setOpenId(null)} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          </>
          )}

          {isMobile && (
            <div style={{ marginTop: '16px' }}>
              <div onClick={() => setShowReceipts(s => !s)} style={{ fontSize: '13px', color: 'var(--action)', textDecoration: 'underline', cursor: 'pointer', marginBottom: '10px' }}>
                {showReceipts ? 'Hide receipts' : `Show all receipts (${rows.length})`}
              </div>
              {showReceipts && receiptsPanel}
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: isMobile ? 0 : '220px', right: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', background: 'var(--surface-card)', borderTop: '1px solid var(--taupe-200)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', boxSizing: 'border-box' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
              {rows.length} expense{rows.length !== 1 ? 's' : ''} · ₹{total.toLocaleString('en-IN')}
            </div>
            {step === 'report' && detailsMissing && (
              <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginTop: '2px' }}>Fill in the report duration to continue.</div>
            )}
            {step === 'expenses' && (error || !allReady) && (
              <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginTop: '2px' }}>
                {error || `Still to fill in: ${missingSummary}`}
              </div>
            )}
          </div>
          {step === 'report' ? (
            <button
              type="button"
              onClick={() => canContinue && setStep('expenses')}
              disabled={!canContinue}
              style={{
                height: '44px', padding: '0 24px', border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                background: canContinue ? 'var(--action)' : 'var(--taupe-200)',
                color: canContinue ? 'var(--surface-card)' : 'var(--text-muted)',
                cursor: canContinue ? 'pointer' : 'default',
              }}
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              data-tour-anchor="er-preview"
              onClick={handlePreview}
              aria-disabled={!allReady}
              title={allReady ? '' : `Still to fill in: ${missingSummary}`}
              style={{
                height: '44px', padding: '0 24px', border: 'none', borderRadius: 'var(--radius-sm)',
                fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                background: allReady ? 'var(--action)' : 'var(--taupe-200)',
                color: allReady ? 'var(--surface-card)' : 'var(--text-muted)',
                cursor: allReady ? 'pointer' : 'help',
              }}
            >
              {busy ? 'Checking…' : 'Preview report →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
