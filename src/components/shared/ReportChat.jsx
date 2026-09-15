import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const ROLE_CONFIG = {
  finance:  { label: 'Finance',  bg: 'var(--action-bg)', border: 'var(--action-bg)', color: 'var(--action)' },
  approver: { label: 'Approver', bg: 'var(--gold-bg)', border: '#DDD6FE', color: 'var(--gold-text)' },
  employee: { label: 'Employee', bg: 'var(--taupe-50)', border: 'var(--taupe-200)', color: 'var(--ink)' },
}

export default function ReportChat({ reportId, currentRole, currentName }) {
  const [comments, setComments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [message, setMessage]     = useState('')
  const [requiresAction, setRequiresAction] = useState(false)
  const [posting, setPosting]     = useState(false)
  const [error, setError]         = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    load()

    // Realtime subscription
    const channel = supabase
      .channel(`chat-${reportId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'report_comments',
        filter: `report_id=eq.${reportId}`,
      }, payload => {
        setComments(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [reportId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('report_comments')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setLoading(false)
  }

  async function handlePost() {
    if (!message.trim()) return
    setPosting(true)
    setError(null)

    const { error: err } = await supabase.from('report_comments').insert({
      report_id:      reportId,
      author_role:    currentRole,
      author_name:    currentName || currentRole,
      message:        message.trim(),
      requires_action: currentRole === 'finance' ? requiresAction : false,
      resolved:       false,
    })

    if (err) {
      if (err.message?.includes('report_comments') || err.code === '42P01') {
        setError('Run the SQL in Supabase first: CREATE TABLE report_comments ...')
      } else {
        setError('Failed to send. Try again.')
      }
      setPosting(false)
      return
    }

    setMessage('')
    setRequiresAction(false)
    setPosting(false)
  }

  async function handleResolve(commentId) {
    await supabase
      .from('report_comments')
      .update({ resolved: true })
      .eq('id', commentId)
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c))
  }

  const openActions = comments.filter(c => c.requires_action && !c.resolved)

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Comments {comments.length > 0 && `(${comments.length})`}
        </div>
        {openActions.length > 0 && (
          <div style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--clay-text)',
            background: 'var(--clay-bg)', border: '1px solid var(--clay-border)',
            borderRadius: 'var(--radius-sm)', padding: '2px 8px',
          }}>
            {openActions.length} action{openActions.length !== 1 ? 's' : ''} required
          </div>
        )}
      </div>

      {/* Thread */}
      <div style={{
        border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-lg)',
        overflow: 'hidden', marginBottom: '12px',
      }}>
        {loading && (
          <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading comments...</div>
        )}

        {!loading && comments.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
            No comments yet
          </div>
        )}

        {!loading && comments.map((c, i) => {
          const rc = ROLE_CONFIG[c.author_role] || ROLE_CONFIG.employee
          return (
            <div key={c.id} style={{
              padding: '12px 16px',
              borderBottom: i < comments.length - 1 ? '1px solid var(--taupe-100)' : 'none',
              background: c.requires_action && !c.resolved ? 'var(--gold-bg)' : 'var(--surface-card)',
            }}>
              {/* Author row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)', background: rc.bg, color: rc.color,
                    border: `1px solid ${rc.border}`,
                  }}>
                    {rc.label}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink)' }}>
                    {c.author_name}
                  </span>
                  {c.requires_action && !c.resolved && (
                    <span style={{
                      fontSize: '10px', fontWeight: 600, color: 'var(--clay-text)',
                      background: 'var(--clay-bg)', padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    }}>
                      Action required
                    </span>
                  )}
                  {c.resolved && (
                    <span style={{ fontSize: '10px', color: '#10B981' }}>Resolved</span>
                  )}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{fmtTime(c.created_at)}</span>
              </div>

              {/* Message */}
              <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>
                {c.message}
              </div>

              {/* Resolve button — finance can resolve action items after employee replies */}
              {c.requires_action && !c.resolved && currentRole === 'finance' && (
                <button
                  onClick={() => handleResolve(c.id)}
                  style={{
                    marginTop: '8px', height: '26px', padding: '0 10px',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--taupe-200)',
                    background: 'var(--surface-card)', color: 'var(--ink)', fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Mark resolved
                </button>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={currentRole === 'finance'
            ? 'Send a query or comment to the employee…'
            : 'Reply to finance team…'}
          rows={2}
          style={{
            width: '100%', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)',
            padding: '10px 12px', fontSize: '13px', color: 'var(--ink)',
            outline: 'none', resize: 'none', fontFamily: 'inherit',
            lineHeight: 1.5, boxSizing: 'border-box',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost()
          }}
        />

        {currentRole === 'finance' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={requiresAction}
              onChange={e => setRequiresAction(e.target.checked)}
              style={{ width: '14px', height: '14px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--ink)' }}>
              Requires employee action
            </span>
          </label>
        )}

        {error && (
          <div style={{ fontSize: '11px', color: 'var(--clay-text)' }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handlePost}
            disabled={posting || !message.trim()}
            style={{
              height: '34px', padding: '0 18px', borderRadius: 'var(--radius-md)',
              background: message.trim() ? 'var(--ink)' : 'var(--taupe-100)',
              color: message.trim() ? 'var(--surface-card)' : 'var(--text-muted)',
              border: 'none', fontSize: '12px', fontWeight: 600,
              cursor: message.trim() ? 'pointer' : 'default',
            }}
          >
            {posting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
