import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { findDuplicateSignals } from '../../lib/duplicateCheck'
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
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }} title="Open full size">
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

function VouchLine({ expense, capture, events, signals, policy, open, onToggle, composer, onCompose, onTick, onUndo, onSend, busy, isMobile }) {
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
            {policyMessages.length > 0 && <Chip tone="gold">Policy</Chip>}
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
  const [checking, setChecking] = useState(true)
  const [openIds, setOpenIds] = useState(null) // null until the first load decides which lines start open
  const [composer, setComposer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => setEvents(await loadVouchEvents(report.id)), [report.id])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const captureIds = expenses.map(e => e.capture_id).filter(Boolean)
      const [ev, caps, dup] = await Promise.all([
        loadVouchEvents(report.id),
        captureIds.length
          ? supabase.from('expense_captures').select('id, receipt_storage_path, receipt_extracted_amount, receipt_extracted_vendor, receipt_extracted_date').in('id', captureIds)
          : { data: [] },
        findDuplicateSignals(report, expenses),
      ])
      if (cancelled) return
      setEvents(ev)
      setCaptures(Object.fromEntries((caps.data || []).map(c => [c.id, c])))
      setChecks(dup)
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

  const statusOf = useCallback(e => lineStatus(events[e.id] || []), [events])
  const waiting = expenses.filter(e => statusOf(e) === 'query').length
  useEffect(() => { onWaitingChange?.(waiting) }, [waiting, onWaitingChange])

  const isClean = useCallback(e => {
    const policy = policyResults?.[e.id]
    const sigs = checks.byExpense[e.id] || []
    const policyIssue = (policy?.violations?.length || 0) + (policy?.flags || []).filter(f => !f.internalOnly && !(f.rule === 'duplicate' && sigs.length > 0)).length > 0
    const mism = receiptMismatches(e, captures[e.capture_id])
    return statusOf(e) === 'none' && !policyIssue && sigs.length === 0 && mism.length === 0 && !!e.capture_id
  }, [policyResults, checks, captures, statusOf])

  const cleanLines = useMemo(() => (checking ? [] : expenses.filter(isClean)), [checking, expenses, isClean])
  const vouched = expenses.filter(e => statusOf(e) === 'clear').length

  // Lines with something to look at start open; clean ones stay collapsed.
  useEffect(() => {
    if (checking || openIds) return
    setOpenIds(new Set(expenses.filter(e => !isClean(e)).map(e => e.id)))
  }, [checking, openIds, expenses, isClean])
  const open = openIds || new Set()
  const toggle = id => setOpenIds(prev => { const n = new Set(prev || []); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function run(fn) {
    setBusy(true); setError(null)
    let ok = true
    try { await fn(); await reload() } catch { ok = false; setError('That could not be saved. Please try again.') }
    setBusy(false)
    return ok
  }
  const onTick = expense => run(() => addVouchEvent({ report, expense, kind: 'clear', user, role: 'finance' }))
  const onUndo = expense => run(() => addVouchEvent({ report, expense, kind: 'reopen', user, role: 'finance' }))
  const onSend = (expense, mode, body) => run(async () => {
    await addVouchEvent({ report, expense, kind: mode, body, user, role: 'finance' })
    setComposer(null)
  })
  const onClearAll = () => run(() => clearLines({ report, expenses: cleanLines, user }))
  const onCompose = (expenseId, mode) => {
    setComposer(expenseId ? { expenseId, mode } : null)
    if (expenseId) setOpenIds(prev => new Set([...(prev || []), expenseId]))
  }

  const pct = expenses.length ? Math.round((vouched / expenses.length) * 100) : 0

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', padding: '12px 14px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Vouching</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {vouched} of {expenses.length} line{expenses.length === 1 ? '' : 's'} vouched
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
            Clean means the receipt matches what was entered, no duplicate or split-bill match and no policy issue.
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

      {expenses.map(exp => (
        <VouchLine
          key={exp.id}
          expense={exp}
          capture={captures[exp.capture_id]}
          events={events[exp.id] || []}
          signals={checks.byExpense[exp.id] || []}
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
