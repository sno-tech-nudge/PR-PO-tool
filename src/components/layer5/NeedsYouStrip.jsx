import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toInputDate } from '../../lib/dateFormat'

const DAY = 86400000
const MAX_ITEMS = 3

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// How many whole days ago a stored date (DD/MM/YYYY or a date string) was.
function daysAgo(value) {
  const iso = toInputDate(String(value || '').trim())
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date(value)
  return Number.isNaN(d.getTime()) ? null : Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY))
}

// A short list at the end of Home: the few things only this person can unblock.
// In order of how much they hold something up: a Finance question waiting for
// their answer, a returned report, saved expenses never put in a report (with
// the age of the oldest, so it can be filed before the 30-day mark), and
// drafts left unfinished. At most three show, and nothing shows when there is
// nothing to do.
export default function NeedsYouStrip({ user, onViewReport, onOpenMyExpenses, onResumePRDraft, onResumeVendorDraft }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const emails = user?.ownEmails?.length ? user.ownEmails : [user?.email].filter(Boolean)
      if (!emails.length) { setItems([]); return }
      const [{ data: reports }, { data: saved }, { data: draftPRs }, { data: draftVendors }] = await Promise.all([
        supabase.from('expense_reports').select('id, report_reference, status, rejected_at, created_at').in('employee_email', emails).in('status', ['submitted', 'under_review', 'rejected']),
        supabase.from('expense_details').select('date, created_at').eq('status', 'saved').in('user_email', emails).limit(1000),
        supabase.from('purchase_requests').select('id, pr_number, vendors(org_name)').in('requested_by', emails).eq('status', 'draft').order('created_at', { ascending: false }).limit(5),
        supabase.from('vendors').select('id, org_name').in('submitted_by', emails).in('status', ['draft', 'pending_review']).order('created_at', { ascending: false }).limit(5),
      ])
      const out = []

      // 1. Finance questions waiting on this person: a line whose latest event is a query.
      const inProgress = (reports || []).filter(r => r.status !== 'rejected')
      if (inProgress.length) {
        const { data: events } = await supabase.from('expense_vouch_events').select('report_id, expense_id, kind, created_at').in('report_id', inProgress.map(r => r.id)).order('created_at', { ascending: true })
        const latest = {}
        for (const e of events || []) latest[`${e.report_id}|${e.expense_id}`] = e
        const open = {}
        for (const e of Object.values(latest)) if (e.kind === 'query') open[e.report_id] = (open[e.report_id] || 0) + 1
        const asked = inProgress.filter(r => open[r.id])
        if (asked.length) {
          const total = asked.reduce((s, r) => s + open[r.id], 0)
          out.push({
            key: 'questions', tone: 'clay', title: `Finance asked ${plural(total, 'question')}`,
            sub: asked.length === 1 ? `About ${asked[0].report_reference}. Your answer unblocks the report.` : `On ${plural(asked.length, 'report')}. Your answers unblock them.`,
            go: () => onViewReport?.(asked[0].id),
          })
        }
      }

      // 2. Returned reports, from the last two months.
      const returned = (reports || []).filter(r => r.status === 'rejected' && (Date.now() - new Date(r.rejected_at || r.created_at).getTime()) < 60 * DAY)
        .sort((a, b) => new Date(b.rejected_at || b.created_at) - new Date(a.rejected_at || a.created_at))
      if (returned.length) {
        out.push({
          key: 'returned', tone: 'clay',
          title: returned.length === 1 ? `${returned[0].report_reference} was returned to you` : `${returned.length} reports were returned to you`,
          sub: 'Open it to see why, then fix and send it again.',
          go: () => onViewReport?.(returned[0].id),
        })
      }

      // 3. Saved expenses that never went into a report.
      if (saved?.length) {
        const ages = saved.map(s => daysAgo(s.date) ?? daysAgo(s.created_at)).filter(a => a != null)
        const oldest = ages.length ? Math.max(...ages) : null
        let when = ''
        if (oldest != null) {
          const age = oldest > 60 ? `${Math.floor(oldest / 30)} months` : `${oldest} day${oldest === 1 ? '' : 's'}`
          when = oldest > 30 ? ` The oldest is ${age} old, past the 30-day mark.`
            : oldest >= 20 ? ` The oldest is ${age} old, so file it soon.`
            : ` The oldest is ${age} old.`
        }
        out.push({
          key: 'unfiled', tone: oldest != null && oldest >= 20 ? 'gold' : 'taupe',
          title: `${plural(saved.length, 'saved expense')} not in a report`, sub: when.trim() || 'Put them in a report to get paid.',
          go: () => onOpenMyExpenses?.(),
        })
      }

      // 4. Drafts left unfinished.
      const drafts = (draftPRs || []).length + (draftVendors || []).length
      if (drafts) {
        const firstPR = (draftPRs || [])[0]
        const firstVendor = (draftVendors || [])[0]
        out.push({
          key: 'drafts', tone: 'taupe', title: `${plural(drafts, 'draft')} to finish`,
          sub: `${firstPR ? (firstPR.vendors?.org_name || firstPR.pr_number || 'A purchase request') : (firstVendor?.org_name || 'A vendor')}${drafts > 1 ? ' and more.' : '.'}`,
          go: () => (firstPR ? onResumePRDraft?.(firstPR.id) : onResumeVendorDraft?.(firstVendor.id)),
        })
      }

      if (!cancelled) setItems(out.slice(0, MAX_ITEMS))
    }
    load().catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [user?.email, user?.ownEmails, onViewReport, onOpenMyExpenses, onResumePRDraft, onResumeVendorDraft])

  if (!items?.length) return null
  const dot = { clay: 'var(--clay-text)', gold: 'var(--gold-text)', taupe: 'var(--taupe-400)' }

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
        Needs you
      </div>
      <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {items.map((it, i) => (
          <div
            key={it.key} role="button" onClick={it.go}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 16px', cursor: 'pointer', borderTop: i ? '1px solid var(--taupe-100)' : 'none', background: 'var(--surface-card)' }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot[it.tone], flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{it.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>{it.sub}</div>
            </div>
            <span style={{ fontSize: '16px', color: 'var(--taupe-400)' }}>›</span>
          </div>
        ))}
      </div>
    </div>
  )
}
