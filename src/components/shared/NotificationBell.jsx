import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const TYPE_COLOR = {
  pr_approved: 'var(--moss-text)', vendor_approved: 'var(--moss-text)', approved: 'var(--moss-text)',
  pr_rejected: 'var(--clay-text)', vendor_rejected: 'var(--clay-text)', rejected: 'var(--clay-text)',
  pr_submitted: 'var(--gold-text)', bank_change_request: 'var(--gold-text)', link_suggestion: 'var(--action)',
}

// Sidebar-footer notification bell — reads expense_notifications (a table
// every approve/reject action already writes to, but that nothing in the UI
// used to read). Polls rather than subscribing in realtime, matching this
// app's existing async-job-queue polling convention elsewhere.
export default function NotificationBell({ user, onOpenReport, onOpenPR, onOpenVendor, onOpenPO }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    load()
    // Matches the 15s polling interval every other list/dashboard in this
    // app already uses (PRList, PRApproverDashboard, FinancePRsView, …) —
    // this was left at 30s, making it visibly slower to reflect a fresh
    // approve/reject than everything else on the page.
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [user.email])

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function load() {
    const { data } = await supabase
      .from('expense_notifications')
      .select('*')
      .eq('recipient_id', user.email)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }

  const unreadCount = notifications.filter(n => !n.is_read).length
  const readCount = notifications.length - unreadCount

  async function markRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    await supabase.from('expense_notifications').update({ is_read: true }).eq('id', id)
  }

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await supabase.from('expense_notifications').update({ is_read: true }).eq('recipient_id', user.email).eq('is_read', false)
  }

  // Deletes only already-read notifications — unread ones are left alone so
  // this can never be used to accidentally dismiss something not yet seen.
  async function clearRead() {
    setNotifications(prev => prev.filter(n => !n.is_read))
    await supabase.from('expense_notifications').delete().eq('recipient_id', user.email).eq('is_read', true)
  }

  function handleClick(n) {
    if (!n.is_read) markRead(n.id)
    setOpen(false)
    if (n.related_type === 'report' && n.related_id) onOpenReport?.(n.related_id)
    else if (n.related_type === 'pr' && n.related_id) onOpenPR?.(n.related_id)
    else if (n.related_type === 'vendor' && n.related_id) onOpenVendor?.(n.related_id)
    else if (n.related_type === 'po' && n.related_id) onOpenPO?.(n.related_id)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: '10px' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-on-dark-muted)', flexShrink: 0 }}>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span style={{ fontSize: '12px', color: 'var(--surface-card)' }}>Notifications</span>
        </div>
        {unreadCount > 0 && (
          <span style={{
            fontSize: '10px', fontWeight: 700, background: 'var(--clay-text)', color: 'var(--surface-card)',
            borderRadius: 'var(--radius-lg)', padding: '1px 6px', minWidth: '16px', textAlign: 'center', lineHeight: '14px',
          }}>
            {unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div style={{
          position: 'fixed', left: '230px', bottom: '16px', width: '340px', maxHeight: '70vh',
          background: 'var(--surface-card)', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 28px rgba(54, 32, 26,0.25)', zIndex: 300, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--taupe-100)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notifications</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <span onClick={markAllRead} style={{ fontSize: '11px', color: 'var(--action)', cursor: 'pointer' }}>Mark all as read</span>
              )}
              {unreadCount > 0 && readCount > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--taupe-400)' }}>·</span>
              )}
              {readCount > 0 && (
                <span onClick={clearRead} style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>Clear read</span>
              )}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>No notifications yet.</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--taupe-100)', cursor: 'pointer',
                    background: n.is_read ? 'var(--surface-card)' : 'var(--gold-bg)', display: 'flex', gap: '8px', alignItems: 'flex-start',
                  }}
                >
                  <div style={{
                    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, marginTop: '4px',
                    background: n.is_read ? 'transparent' : (TYPE_COLOR[n.type] || 'var(--text-muted)'),
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.4, fontWeight: n.is_read ? 400 : 600 }}>{n.message}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
