import { useState, useEffect, useCallback } from 'react'
import { loadVouchEvents, addVouchEvent } from '../../lib/vouch'

const fmtWhen = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function QueryCard({ expense, events, open, onReply }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function send() {
    if (!text.trim()) return
    setSending(true); setFailed(false)
    const ok = await onReply(expense, events, text.trim())
    if (ok) setText(''); else setFailed(true)
    setSending(false)
  }

  return (
    <div style={{ border: `1px solid ${open ? 'var(--gold-border)' : 'var(--taupe-200)'}`, background: open ? 'var(--gold-bg)' : 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{expense.vendor || 'Expense'}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{expense.amount ? `₹${Number(expense.amount).toLocaleString('en-IN')}` : ''}</div>
      </div>
      {events.map(e => (
        <div key={e.id} style={{ fontSize: '12px', lineHeight: 1.5, padding: '4px 0 4px 10px', borderLeft: `2px solid ${e.kind === 'query' ? 'var(--clay-border)' : 'var(--action)'}`, marginBottom: '4px' }}>
          <div style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{e.kind === 'query' ? (e.author_name || 'Finance') : 'You'}</strong> · {fmtWhen(e.created_at)}
          </div>
          <div style={{ color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{e.body}</div>
        </div>
      ))}
      {open ? (
        <div style={{ marginTop: '8px' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            placeholder="Your reply to Finance"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--taupe-300)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', background: 'var(--surface-card)' }}
          />
          <button
            type="button" onClick={send} disabled={!text.trim() || sending}
            style={{ marginTop: '6px', height: '32px', padding: '0 16px', border: 'none', borderRadius: 'var(--radius-sm)', background: !text.trim() ? 'var(--taupe-200)' : 'var(--action)', color: 'var(--surface-card)', fontSize: '12px', fontWeight: 600, cursor: !text.trim() || sending ? 'default' : 'pointer' }}
          >
            {sending ? 'Sending…' : 'Send reply'}
          </button>
          {failed && <span style={{ fontSize: '12px', color: 'var(--clay-text)', marginLeft: '10px' }}>Could not send. Try again.</span>}
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Answered. Finance will pick it up from here.</div>
      )}
    </div>
  )
}

// The employee's side of line-by-line vouching: the questions Finance has asked
// about individual expenses, with a place to answer. Flags are Finance's own
// notes and never show here.
export default function VouchQueries({ report, expenses, user }) {
  const [events, setEvents] = useState({})

  const reload = useCallback(async () => setEvents(await loadVouchEvents(report.id)), [report.id])
  useEffect(() => {
    reload()
    const t = setInterval(reload, 15000)
    return () => clearInterval(t)
  }, [reload])

  async function reply(expense, thread, body) {
    try {
      const lastQuery = [...thread].reverse().find(e => e.kind === 'query')
      await addVouchEvent({ report, expense, kind: 'reply', body, user, role: 'employee', notifyEmail: lastQuery?.author_email })
      await reload()
      return true
    } catch {
      return false
    }
  }

  const lines = expenses
    .map(exp => ({ exp, thread: (events[exp.id] || []).filter(e => e.kind === 'query' || e.kind === 'reply') }))
    .filter(l => l.thread.some(e => e.kind === 'query'))
  if (!lines.length) return null

  const isOpen = thread => thread[thread.length - 1]?.kind === 'query'
  const openCount = lines.filter(l => isOpen(l.thread)).length
  lines.sort((a, b) => Number(isOpen(b.thread)) - Number(isOpen(a.thread)))

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>Questions from Finance</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        {openCount > 0
          ? `${openCount} question${openCount === 1 ? ' needs' : 's need'} your answer before Finance can approve this report.`
          : 'All answered.'}
      </div>
      {lines.map(l => <QueryCard key={l.exp.id} expense={l.exp} events={l.thread} open={isOpen(l.thread)} onReply={reply} />)}
    </div>
  )
}
