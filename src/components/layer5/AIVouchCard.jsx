import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { runAIVouchCheck } from '../../lib/claude'

const OVERALL = {
  approve: { label: 'Recommend approval', color: 'var(--moss-text)', bg: 'var(--moss-bg)', border: 'var(--moss-border)' },
  query:   { label: 'Query before approving', color: 'var(--gold-text)', bg: 'var(--gold-bg)', border: 'var(--gold-border)' },
  flag:    { label: 'Flag: do not approve', color: 'var(--clay-text)', bg: 'var(--clay-bg)', border: 'var(--clay-border)' },
}
const EXPENSE = {
  pass: { label: 'Pass', color: 'var(--moss-text)' },
  warn: { label: 'Warn', color: 'var(--gold-text)' },
  flag: { label: 'Flag', color: 'var(--clay-text)' },
}

// AI vouching for the Finance team's step of the approval route. Runs by
// itself when the Finance reviewer opens the report (and can be re-run), shows
// an overall verdict plus a verdict for each expense, and keeps the verdict on
// the report so the Policy Violations dashboard can roll it up. The audit note
// it drafts can be copied into the approval note.
export default function AIVouchCard({ report, expenses, onUseNotes }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function run() {
    setLoading(true)
    setError(null)
    const res = await runAIVouchCheck(report, expenses)
    if (!res) {
      setError('The AI check could not run. Try again.')
    } else {
      setResult(res)
      if (res.overall?.verdict) {
        supabase.from('expense_reports').update({
          ai_vouch_verdict: res.overall.verdict,
          ai_vouch_confidence: res.overall.confidence || null,
          ai_vouch_summary: res.overall.summary || null,
          ai_vouch_checked_at: new Date().toISOString(),
        }).eq('id', report.id).then(({ error: err }) => { if (err) console.error('Saving AI verdict failed:', err.message) })
      }
    }
    setLoading(false)
  }

  // Once per report when the card first appears.
  useEffect(() => {
    if (report?.id && expenses?.length) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id])

  const oc = result ? OVERALL[result.overall?.verdict] : null

  return (
    <div data-testid="ai-vouch" style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', marginBottom: '16px', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: oc ? oc.bg : 'var(--taupe-50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>AI vouching for Finance</div>
          {result && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {result.overall?.confidence === 'high' ? 'High' : result.overall?.confidence === 'medium' ? 'Medium' : 'Low'} confidence
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          style={{
            height: '28px', padding: '0 12px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '11px', fontWeight: 600,
            background: loading ? 'var(--taupe-100)' : 'var(--action)', color: loading ? 'var(--text-muted)' : 'var(--surface-card)',
            cursor: loading ? 'default' : 'pointer', flexShrink: 0,
          }}
        >
          {loading ? 'Checking…' : result ? 'Re-run' : 'Run check'}
        </button>
      </div>

      {loading && (
        <div style={{ padding: '14px' }}>
          {[100, 85, 60].map((w, i) => <div key={i} style={{ height: '11px', background: 'var(--taupe-100)', borderRadius: 'var(--radius-xs)', marginBottom: '8px', width: `${w}%` }} />)}
        </div>
      )}

      {!loading && error && <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--clay-text)' }}>{error}</div>}

      {!loading && result && oc && (
        <div style={{ padding: '14px' }}>
          <div style={{ background: oc.bg, border: `1px solid ${oc.border}`, borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: oc.color, marginBottom: '4px' }}>{oc.label}</div>
            {result.overall?.summary && <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5 }}>{result.overall.summary}</div>}
          </div>

          {(result.expenses || []).length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              {result.expenses.map(v => {
                const exp = expenses[v.index]
                const ev = EXPENSE[v.verdict] || EXPENSE.warn
                return (
                  <div key={v.index} style={{ display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--taupe-100)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: ev.color, width: '34px', flexShrink: 0 }}>{ev.label}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink)' }}>
                        {exp?.vendor || `Expense ${v.index + 1}`}{exp?.amount ? ` · ₹${Number(exp.amount).toLocaleString('en-IN')}` : ''}
                      </div>
                      {v.reason && <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: '1px' }}>{v.reason}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {result.audit_notes && onUseNotes && (
            <button
              type="button"
              onClick={() => onUseNotes(result.audit_notes)}
              style={{ width: '100%', height: '32px', background: 'var(--surface-card)', color: 'var(--ink)', border: '1px dashed var(--taupe-400)', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer' }}
            >
              Use the AI audit note
            </button>
          )}
        </div>
      )}
    </div>
  )
}
