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
  pr_approved: '#15803D', vendor_approved: '#15803D', approved: '#15803D',
  pr_rejected: '#B91C1C', vendor_rejected: '#B91C1C', rejected: '#B91C1C',
  pr_submitted: '#B45309', bank_change_request: '#B45309', link_suggestion: '#1565C0',
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
    const interval = setInterval(load, 30000)
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

  async function markRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    await supabase.from('expense_notifications').update({ is_read: true }).eq('id', id)
  }

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await supabase.from('expense_notifications').update({ is_read: true }).eq('recipient_id', user.email).eq('is_read', false)
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
          padding: '7px 10px', borderRadius: '5px', cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px' }}>🔔</span>
          <span style={{ fontSize: '12px', color: '#FFFFFF' }}>Notifications</span>
        </div>
        {unreadCount > 0 && (
          <span style={{
            fontSize: '10px', fontWeight: 700, background: '#DC2626', color: '#FFFFFF',
            borderRadius: '10px', padding: '1px 6px', minWidth: '16px', textAlign: 'center', lineHeight: '14px',
          }}>
            {unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div style={{
          position: 'fixed', left: '230px', bottom: '16px', width: '340px', maxHeight: '70vh',
          background: '#FFFFFF', border: '1px solid #E3E8EF', borderRadius: '6px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.25)', zIndex: 300, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1A1F36', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notifications</span>
            {unreadCount > 0 && (
              <span onClick={markAllRead} style={{ fontSize: '11px', color: '#8C3225', cursor: 'pointer' }}>Mark all as read</span>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '12px', color: '#9CA3AF' }}>No notifications yet.</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer',
                    background: n.is_read ? '#FFFFFF' : '#FFFBEB', display: 'flex', gap: '8px', alignItems: 'flex-start',
                  }}
                >
                  <div style={{
                    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, marginTop: '4px',
                    background: n.is_read ? 'transparent' : (TYPE_COLOR[n.type] || '#6B7280'),
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#1A1F36', lineHeight: 1.4, fontWeight: n.is_read ? 400 : 600 }}>{n.message}</div>
                    <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '3px' }}>{timeAgo(n.created_at)}</div>
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
