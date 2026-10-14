import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { findDuplicateSignals } from '../../lib/duplicateCheck'
import { runTaxChecks } from '../../lib/taxChecks'
import { loadTdsRules, computeTds, vendorYtdBase } from '../../lib/tds'
import { loadVendorRegistry, matchVendor } from '../../lib/vendorMatch'
import { needsPoLink } from '../../lib/policyPrompt'
import { lineNet, recomputeNetPayable, saveTds } from '../../lib/deductions'
import { logActivity } from '../../lib/activityLog'
import AccountsPanel from './AccountsPanel'
import AiContentBadge from '../shared/AiContentBadge'
import AssignmentControl from '../layer6/AssignmentControl'
import { loadVouchEvents, addVouchEvent, clearLines, lineStatus, LINE_STATUS, receiptMismatches } from '../../lib/vouch'
import { useIsMobile } from '../../hooks/useIsMobile'

const TONE = {
  moss:  { bg: 'var(--moss-bg)', border: 'var(--moss-border)', text: 'var(--moss-text)' },
  gold:  { bg: 'var(--gold-bg)', border: 'var(--gold-border)', text: 'var(--gold-text)' },
  clay:  { bg: 'var(--clay-bg)', border: 'var(--clay-border)', text: 'var(--clay-text)' },
  taupe: { bg: 'var(--taupe-50)', border: 'var(--taupe-200)', text: 'var(--text-muted)' },
}

const fmtWhen = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Chip({ tone = 'gold', children }) {
  const t = TONE[tone]
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--radius-xs)', background: t.bg, border: `1px solid ${t.border}`, color: t.text, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function ActionButton({ tone, onClick, children, disabled }) {
  const t = TONE[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        height: '28px', padding: '0 11px', fontSize: '11px', fontWeight: 600, borderRadius: 'var(--radius-sm)',
        border: `1px solid ${t.border}`, background: 'var(--surface-card)', color: t.text, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// A line's receipt, laid out beside the numbers that were entered for it.
function ReceiptPane({ capture }) {
  const [url, setUrl] = useState(null)
  const [state, setState] = useState('loading')
  const path = capture?.receipt_storage_path
  useEffect(() => {
    let cancelled = false
    if (!path) { setState('none'); return }
    supabase.storage.from('expense-documents').createSignedUrl(path, 3600).then(({ data }) => {
      if (cancelled) return
      if (data?.signedUrl) { setUrl(data.signedUrl); setState('ok') } else setState('none')
    })
    return () => { cancelled = true }
  }, [path])

  if (state === 'loading') return <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading receipt…</div>
  if (state === 'none') {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', border: '1px dashed var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '24px 12px', textAlign: 'center' }}>
        No receipt attached
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative' }} title="Open full size">
      {capture?.ai_content_flag && <AiContentBadge style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 1 }} />}
      <img src={url} alt="Receipt" style={{ width: '100%', maxHeight: '340px', objectFit: 'contain', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', background: 'var(--taupe-50)', display: 'block' }} />
    </a>
  )
}

function CompareTable({ expense, capture, mismatches }) {
  const diff = Object.fromEntries(mismatches.map(m => [m.field, true]))
  const rows = [
    ['Vendor', 'vendor', expense.vendor, capture?.receipt_extracted_vendor],
    ['Amount', 'amount', expense.amount != null ? `₹${Number(expense.amount).toLocaleString('en-IN')}` : null, capture?.receipt_extracted_amount ? `₹${Number(capture.receipt_extracted_amount).toLocaleString('en-IN')}` : null],
    ['Date', 'date', expense.date, capture?.receipt_extracted_date],
    ['Invoice no.', null, expense.invoice_number, null],
    ['GSTIN', null, expense.gstin, null],
    ['Category', null, expense.category, null],
  ].filter(([, , entered, read]) => entered || read)
  return (
    <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', background: 'var(--taupe-50)', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <div style={{ padding: '6px 10px' }} />
        <div style={{ padding: '6px 10px' }}>Entered</div>
        <div style={{ padding: '6px 10px' }}>Read from receipt</div>
      </div>
      {rows.map(([label, key, entered, read]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', borderTop: '1px solid var(--taupe-100)', background: key && diff[key] ? 'var(--gold-bg)' : 'var(--surface-card)', fontSize: '12px' }}>
          <div style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>{label}</div>
          <div style={{ padding: '7px 10px', color: 'var(--ink)', wordBreak: 'break-word' }}>{entered || '—'}</div>
          <div style={{ padding: '7px 10px', color: key && diff[key] ? 'var(--gold-text)' : 'var(--text-muted)', fontWeight: key && diff[key] ? 600 : 400, wordBreak: 'break-word' }}>
            {key ? (read || '—') : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

function Thread({ events }) {
  if (!events.length) return null
  const verb = { clear: 'vouched this line', flag: 'flagged', query: 'asked', reply: 'replied', reopen: 'took back the tick' }
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>History</div>
      {events.map(e => (
        <div key={e.id} style={{ fontSize: '12px', lineHeight: 1.5, padding: '5px 0 5px 10px', borderLeft: `2px solid ${e.kind === 'clear' ? 'var(--moss-border)' : e.kind === 'query' ? 'var(--clay-border)' : e.kind === 'reply' ? 'var(--action)' : 'var(--taupe-200)'}`, marginBottom: '4px' }}>
          <div style={{ color: 'var(--ink)' }}>
            <strong style={{ fontWeight: 600 }}>{e.author_name || e.author_email || 'Someone'}</strong> {verb[e.kind]}
            <span style={{ color: 'var(--text-muted)' }}> · {fmtWhen(e.created_at)}</span>
          </div>
          {e.body && <div style={{ color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{e.body}</div>}
        </div>
      ))}
    </div>
  )
}

function VouchLine({ report, user, expense, capture, events, signals, taxes: allTaxes, policy, isVendor, tdsInfo, tdsPreview, onPatch, open, onToggle, composer, onCompose, onTick, onUndo, onSend, busy, isMobile }) {
  const [text, setText] = useState('')
  const status = lineStatus(events)
  const st = LINE_STATUS[status]
  const tone = TONE[st.tone]
  const mismatches = receiptMismatches(expense, capture)
  const dupes = signals.filter(s => s.kind !== 'split')
  // The older in-report "looks similar" flag says the same thing as the duplicate check, so show it once.
  const policyMessages = [...(policy?.violations || []), ...(policy?.flags || []).filter(f => !f.internalOnly)]
    .filter(f => !(f.rule === 'duplicate' && dupes.length > 0))
    .map(f => f.message).filter(Boolean)
  const splits = signals.filter(s => s.kind === 'split')
  const myComposer = composer?.expenseId === expense.id ? composer.mode : null
  // On a vendor payment the Accounts panel decides TDS, so the plain hint is left out.
  const taxes = isVendor ? allTaxes.filter(t => t.kind !== 'tds') : allTaxes
  const taxProblems = taxes.filter(t => t.level === 'bad' || t.level === 'warn')
  const tds = taxes.find(t => t.kind === 'tds')
  const noPo = needsPoLink({ amount: expense.amount, category: expense.category, hasPo: !!expense.po_number || isVendor })
  const deducted = Number(expense.deduction_amount) || 0

  function submit() {
    if (!text.trim()) return
    onSend(expense, myComposer, text.trim()).then(ok => { if (ok) setText('') })
  }

  return (
    <div style={{ border: '1px solid var(--taupe-200)', borderLeft: `3px solid ${tone.text}`, borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', marginBottom: '8px' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.vendor || 'Unknown vendor'}</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>{expense.amount ? `₹${Number(expense.amount).toLocaleString('en-IN')}` : '—'}</div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{[expense.category, expense.date].filter(Boolean).join(' · ')}</div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
            <Chip tone={st.tone}>{st.label}</Chip>
            {dupes.length > 0 && <Chip tone="clay">Possible duplicate</Chip>}
            {splits.length > 0 && <Chip tone="gold">Split bill</Chip>}
            {mismatches.length > 0 && <Chip tone="gold">Receipt differs</Chip>}
            {capture?.ai_content_flag && <Chip tone="gold">AI content</Chip>}
            {policyMessages.length > 0 && <Chip tone="gold">Policy</Chip>}
            {taxProblems.length > 0 && <Chip tone={taxProblems.some(t => t.level === 'bad') ? 'clay' : 'gold'}>Tax check</Chip>}
            {isVendor && expense.tds_status
              ? <Chip tone={expense.tds_status === 'applicable' ? 'gold' : 'taupe'}>{expense.tds_status === 'applicable' ? `TDS ₹${Math.round(Number(expense.tds_amount) || 0).toLocaleString('en-IN')}` : 'No TDS'}</Chip>
              : isVendor && tdsPreview && tdsPreview.status !== 'not_applicable'
                ? <Chip tone="gold">TDS to confirm</Chip>
                : tds && !isVendor && <Chip tone="gold">TDS {tds.section}</Chip>}
            {noPo && <Chip tone="gold">No PR/PO</Chip>}
            {deducted > 0 && <Chip tone="clay">Deducted ₹{deducted.toLocaleString('en-IN')}</Chip>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
          {status === 'clear'
            ? <ActionButton tone="taupe" onClick={() => onUndo(expense)} disabled={busy}>Undo tick</ActionButton>
            : <ActionButton tone="moss" onClick={() => onTick(expense)} disabled={busy}>Tick</ActionButton>}
          <ActionButton tone="gold" onClick={() => onCompose(expense.id, 'flag')}>Flag</ActionButton>
          <ActionButton tone="clay" onClick={() => onCompose(expense.id, 'query')}>Ask employee</ActionButton>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--taupe-100)', padding: '14px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(200px, 300px) 1fr', gap: '16px' }}>
          <div><ReceiptPane capture={capture} /></div>
          <div style={{ minWidth: 0 }}>
            <CompareTable expense={expense} capture={capture} mismatches={mismatches} />

            {(dupes.length > 0 || splits.length > 0 || policyMessages.length > 0) && (
              <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {dupes.map((s, i) => (
                  <div key={`d${i}`} style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--clay-text)', background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px' }}>{s.text}</div>
                ))}
                {splits.slice(0, 1).map((s, i) => (
                  <div key={`s${i}`} style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--gold-text)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px' }}>{s.text}</div>
                ))}
                {policyMessages.map((m, i) => (
                  <div key={`p${i}`} style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--gold-text)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px' }}>{m}</div>
                ))}
              </div>
            )}

            {taxes.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Tax checks</div>
                {taxes.map((t, i) => {
                  const tone = t.level === 'ok' ? 'moss' : t.level === 'bad' ? 'clay' : t.level === 'warn' ? 'gold' : 'taupe'
                  return (
                    <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '12px', lineHeight: 1.5, padding: '3px 0', color: t.level === 'info' ? 'var(--ink)' : TONE[tone].text }}>
                      <span style={{ width: '12px', flexShrink: 0, fontWeight: 700 }}>{t.level === 'ok' ? '✓' : t.level === 'info' ? '•' : '!'}</span>
                      <span>{t.text}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {(expense.policy_justification || (noPo && expense.no_po_reason)) && (
              <div style={{ marginBottom: '12px', fontSize: '12px', lineHeight: 1.5, color: 'var(--ink)' }}>
                {expense.policy_justification && <div><span style={{ color: 'var(--text-muted)' }}>Employee&apos;s reason for being over policy: </span>{expense.policy_justification}</div>}
                {noPo && expense.no_po_reason && <div><span style={{ color: 'var(--text-muted)' }}>No PR/PO linked, employee says: </span>{expense.no_po_reason}</div>}
              </div>
            )}

            <AccountsPanel
              key={expense.id}
              report={report} expense={expense} policy={policy} isVendor={isVendor}
              tds={tdsInfo} user={user} onPatch={patch => onPatch(expense.id, patch)}
            />

            <Thread events={events} />

            {myComposer && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {myComposer === 'query' ? 'Your question goes to the employee, and the report waits for their answer.' : 'A note for Finance. The employee does not see it and the report is not held up.'}
                </div>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder={myComposer === 'query' ? 'What do you need from the employee?' : 'What looks off?'}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="button" onClick={submit} disabled={!text.trim() || busy}
                    style={{ height: '30px', padding: '0 14px', border: 'none', borderRadius: 'var(--radius-sm)', background: !text.trim() ? 'var(--taupe-200)' : 'var(--action)', color: 'var(--surface-card)', fontSize: '12px', fontWeight: 600, cursor: !text.trim() ? 'default' : 'pointer' }}
                  >
                    {myComposer === 'query' ? 'Send to employee' : 'Save flag'}
                  </button>
                  <button type="button" onClick={() => onCompose(null, null)} style={{ height: '30px', padding: '0 12px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-card)', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// The Finance team's line-by-line vouching view: every expense on its own row
// with a tick / flag / ask-the-employee action, the receipt beside the numbers
// that were entered, and duplicate and split-bill checks across everyone's
// expenses. onWaitingChange reports how many lines are waiting on the employee,
// since the report should not be approved over an open question.
export default function VouchChecklist({ report, expenses, user, policyResults, onWaitingChange }) {
  const isMobile = useIsMobile()
  const [events, setEvents] = useState({})
  const [captures, setCaptures] = useState({})
  const [checks, setChecks] = useState({ byExpense: {}, split: [] })
  const [taxes, setTaxes] = useState({})
  const [checking, setChecking] = useState(true)
  const [openIds, setOpenIds] = useState(null) // null until the first load decides which lines start open
  const [composer, setComposer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Edits made on this screen (deductions, TDS) laid over the loaded lines.
  const [overrides, setOverrides] = useState({})
  const exps = useMemo(() => expenses.map(e => ({ ...e, ...(overrides[e.id] || {}) })), [expenses, overrides])
  const [kind, setKind] = useState(report.payment_kind || 'reimbursement')
  const isVendor = kind === 'vendor'
  const [tdsInfo, setTdsInfo] = useState({}) // expenseId -> { rules, pan, ytd }

  const reload = useCallback(async () => setEvents(await loadVouchEvents(report.id)), [report.id])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const captureIds = expenses.map(e => e.capture_id).filter(Boolean)
      const [ev, caps, dup, tax] = await Promise.all([
        loadVouchEvents(report.id),
        captureIds.length
          ? supabase.from('expense_captures').select('id, receipt_storage_path, receipt_extracted_amount, receipt_extracted_vendor, receipt_extracted_date, ai_content_flag').in('id', captureIds)
          : { data: [] },
        findDuplicateSignals(report, expenses),
        runTaxChecks(expenses),
      ])
      if (cancelled) return
      setEvents(ev)
      setCaptures(Object.fromEntries((caps.data || []).map(c => [c.id, c])))
      setChecks(dup)
      setTaxes(tax)
      setChecking(false)
    }
    load()
    return () => { cancelled = true }
  }, [report, expenses])

  // The employee can reply while this screen is open.
  useEffect(() => {
    const t = setInterval(reload, 15000)
    return () => clearInterval(t)
  }, [reload])

  // For vendor payments: the TDS rules, each vendor's PAN, and what the vendor
  // has been paid earlier this financial year.
  useEffect(() => {
    if (!isVendor) return
    let cancelled = false
    async function loadTds() {
      const [rules, registry] = await Promise.all([loadTdsRules(), loadVendorRegistry()])
      const entries = await Promise.all(expenses.map(async e => {
        const vendor = (e.vendor_id && registry.find(v => v.id === e.vendor_id)) || matchVendor(registry, { name: e.vendor, gstin: e.gstin })?.vendor || null
        const ytd = await vendorYtdBase({ ...e, vendor_id: e.vendor_id || vendor?.id || null })
        return [e.id, { rules, pan: vendor?.pan_number || null, ytd }]
      }))
      if (!cancelled) setTdsInfo(Object.fromEntries(entries))
    }
    loadTds()
    return () => { cancelled = true }
  }, [isVendor, expenses])

  const tdsPreview = useMemo(() => {
    const out = {}
    if (!isVendor) return out
    for (const e of exps) {
      const info = tdsInfo[e.id]
      if (info) out[e.id] = computeTds({ rules: info.rules, category: e.category, pan: info.pan, base: e.base_amount || e.amount, ytdBase: info.ytd })
    }
    return out
  }, [isVendor, exps, tdsInfo])

  const statusOf = useCallback(e => lineStatus(events[e.id] || []), [events])
  const waiting = exps.filter(e => statusOf(e) === 'query').length
  useEffect(() => { onWaitingChange?.(waiting) }, [waiting, onWaitingChange])

  const isClean = useCallback(e => {
    const policy = policyResults?.[e.id]
    const sigs = checks.byExpense[e.id] || []
    const policyIssue = (policy?.violations?.length || 0) + (policy?.flags || []).filter(f => !f.internalOnly && !(f.rule === 'duplicate' && sigs.length > 0)).length > 0
    const mism = receiptMismatches(e, captures[e.capture_id])
    // On a vendor payment the TDS hint is replaced by the Accounts panel's own TDS decision.
    const taxIssue = (taxes[e.id] || []).some(t => t.level !== 'ok' && !(isVendor && t.kind === 'tds'))
    const noPo = needsPoLink({ amount: e.amount, category: e.category, hasPo: !!e.po_number || isVendor })
    // A vendor line is clean only once its TDS is settled, or plainly not due.
    const tdsSettled = !isVendor || !!e.tds_status || tdsPreview[e.id]?.status === 'not_applicable'
    return statusOf(e) === 'none' && !policyIssue && sigs.length === 0 && mism.length === 0 && !taxIssue && !noPo && tdsSettled && !captures[e.capture_id]?.ai_content_flag && !(Number(e.deduction_amount) > 0) && !!e.capture_id
  }, [policyResults, checks, captures, taxes, statusOf, isVendor, tdsPreview])

  const cleanLines = useMemo(() => (checking ? [] : exps.filter(isClean)), [checking, exps, isClean])
  const vouched = exps.filter(e => statusOf(e) === 'clear').length

  // Lines with something to look at start open; clean ones stay collapsed.
  useEffect(() => {
    if (checking || openIds) return
    setOpenIds(new Set(exps.filter(e => !isClean(e)).map(e => e.id)))
  }, [checking, openIds, exps, isClean])
  const open = openIds || new Set()
  const toggle = id => setOpenIds(prev => { const n = new Set(prev || []); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function run(fn) {
    setBusy(true); setError(null)
    let ok = true
    try { await fn(); await reload() } catch { ok = false; setError('That could not be saved. Please try again.') }
    setBusy(false)
    return ok
  }
  const onPatch = (id, patch) => setOverrides(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))

  // A vendor line cannot be vouched with its TDS undecided. If the rules say
  // none is due it is saved on the spot; otherwise Accounts confirms it first.
  async function ensureTds(expense) {
    if (!isVendor || expense.tds_status) return true
    const preview = tdsPreview[expense.id]
    if (preview?.status !== 'not_applicable') return false
    const { patch } = await saveTds({ report, expense, base: expense.base_amount || expense.amount, gst: expense.gst_amount, result: preview, amountOverride: '', user })
    onPatch(expense.id, patch)
    return true
  }

  const onTick = async expense => {
    let settled
    try { settled = await ensureTds(expense) } catch { settled = false }
    if (!settled) {
      setError('Confirm the TDS for this line first, then tick it.')
      setOpenIds(prev => new Set([...(prev || []), expense.id]))
      return false
    }
    return run(() => addVouchEvent({ report, expense, kind: 'clear', user, role: 'finance' }))
  }
  const onUndo = expense => run(() => addVouchEvent({ report, expense, kind: 'reopen', user, role: 'finance' }))
  const onSend = (expense, mode, body) => run(async () => {
    await addVouchEvent({ report, expense, kind: mode, body, user, role: 'finance' })
    setComposer(null)
  })
  const onClearAll = () => run(async () => {
    for (const e of cleanLines) await ensureTds(e)
    await clearLines({ report, expenses: cleanLines, user })
  })

  // Accounts can flip a report between vendor payment and reimbursement; the
  // net payable follows, since TDS only comes off vendor payments.
  async function changeKind(next) {
    if (next === kind) return
    setKind(next)
    await supabase.from('expense_reports').update({ payment_kind: next }).eq('id', report.id)
    await recomputeNetPayable(report.id)
    logActivity({ entityType: 'report', entityId: report.id, entityRef: report.report_reference, action: 'payment_kind_changed', fromValue: kind, toValue: next, actor: user })
  }

  const totals = useMemo(() => {
    const amount = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const deductions = exps.reduce((s, e) => s + (Number(e.deduction_amount) || 0), 0)
    const tds = isVendor ? exps.reduce((s, e) => s + (Number(e.tds_amount) || 0), 0) : 0
    return { amount, deductions, tds, net: exps.reduce((s, e) => s + lineNet(e, kind), 0) }
  }, [exps, kind, isVendor])
  const onCompose = (expenseId, mode) => {
    setComposer(expenseId ? { expenseId, mode } : null)
    if (expenseId) setOpenIds(prev => new Set([...(prev || []), expenseId]))
  }

  const pct = exps.length ? Math.round((vouched / exps.length) * 100) : 0

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '12px 14px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Vouching</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {vouched} of {exps.length} line{exps.length === 1 ? '' : 's'} vouched
              {waiting > 0 && <span style={{ color: 'var(--clay-text)', fontWeight: 600 }}> · {waiting} waiting on the employee</span>}
              {checking && ' · checking for duplicates…'}
            </div>
          </div>
          <button
            type="button" onClick={onClearAll} disabled={busy || cleanLines.length === 0}
            style={{ height: '32px', padding: '0 14px', border: '1px solid var(--moss-border)', borderRadius: 'var(--radius-sm)', background: cleanLines.length ? 'var(--moss-bg)' : 'var(--taupe-50)', color: cleanLines.length ? 'var(--moss-text)' : 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: cleanLines.length && !busy ? 'pointer' : 'default' }}
          >
            {cleanLines.length ? `Tick ${cleanLines.length} clean line${cleanLines.length === 1 ? '' : 's'}` : 'No clean lines to tick'}
          </button>
        </div>
        <div style={{ height: '4px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-xs)', marginTop: '10px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--moss)', transition: 'width .25s' }} />
        </div>
        {!checking && cleanLines.length > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Clean means the receipt matches what was entered, with no duplicate, split-bill, policy, tax or PR/PO flag{isVendor ? ' and TDS settled' : ''}.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--taupe-100)' }}>
          <AssignmentControl report={report} user={user} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Payment type
            {['vendor', 'reimbursement'].map(k => (
              <span
                key={k} role="button" onClick={() => changeKind(k)}
                style={{
                  padding: '3px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                  border: `1px solid ${kind === k ? 'var(--action)' : 'var(--taupe-300)'}`,
                  background: kind === k ? 'var(--action)' : 'var(--surface-card)', color: kind === k ? 'var(--surface-card)' : 'var(--ink)',
                }}
              >
                {k === 'vendor' ? 'Vendor payment' : 'Reimbursement'}
              </span>
            ))}
          </div>
        </div>
        {(totals.deductions > 0 || totals.tds > 0) && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <span>Claimed ₹{totals.amount.toLocaleString('en-IN')}</span>
            {totals.deductions > 0 && <span style={{ color: 'var(--clay-text)' }}>Deductions −₹{totals.deductions.toLocaleString('en-IN')}</span>}
            {totals.tds > 0 && <span style={{ color: 'var(--gold-text)' }}>TDS −₹{Math.round(totals.tds).toLocaleString('en-IN')}</span>}
            <strong>Net payable ₹{Math.round(totals.net).toLocaleString('en-IN')}</strong>
          </div>
        )}
      </div>

      {checks.split.length > 0 && (
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--gold-text)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: '10px' }}>
          {checks.split.map((g, i) => (
            <div key={i}>
              <strong>Possible split bill:</strong> {g.bills.length} bills from {g.vendor || 'the same vendor'} on {g.date} total ₹{g.total.toLocaleString('en-IN')}, over {g.threshold.label}, though none is on its own.
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: '12px', color: 'var(--clay-text)', marginBottom: '8px' }}>{error}</div>}

      {exps.map(exp => (
        <VouchLine
          key={exp.id}
          report={report}
          user={user}
          isVendor={isVendor}
          tdsInfo={tdsInfo[exp.id]}
          tdsPreview={tdsPreview[exp.id]}
          onPatch={onPatch}
          expense={exp}
          capture={captures[exp.capture_id]}
          events={events[exp.id] || []}
          signals={checks.byExpense[exp.id] || []}
          taxes={taxes[exp.id] || []}
          policy={policyResults?.[exp.id]}
          open={open.has(exp.id)}
          onToggle={() => toggle(exp.id)}
          composer={composer}
          onCompose={onCompose}
          onTick={onTick}
          onUndo={onUndo}
          onSend={onSend}
          busy={busy}
          isMobile={isMobile}
        />
      ))}
    </div>
  )
}
