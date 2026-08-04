import { useState, useEffect } from 'react'

const TYPE_STYLE = {
  approved: { border: '#16A34A', dot: '#16A34A' },
  rejected: { border: '#DC2626', dot: '#DC2626' },
  info: { border: '#E8E8E8', dot: '#6B6B6B' },
}

export default function NotificationToast({ message, type = 'info', onDismiss }) {
  const [entered, setEntered] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const s = TYPE_STYLE[type] || TYPE_STYLE.info

  useEffect(() => {
    // Enter on next frame
    const raf = requestAnimationFrame(() => setEntered(true))

    const dismissTimer = setTimeout(() => {
      setLeaving(true)
      setTimeout(onDismiss, 300)
    }, 4000)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(dismissTimer)
    }
  }, [])

  const visible = entered && !leaving

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? '0' : '-130%'})`,
      transition: 'transform 0.3s ease',
      width: 'calc(100% - 32px)',
      maxWidth: '448px',
      zIndex: 200,
    }}>
      <div style={{
        background: '#FFFFFF',
        border: `1px solid ${s.border}`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: s.dot, flexShrink: 0,
        }} />
        <div style={{ fontSize: '13px', color: '#1A1A1A', flex: 1, lineHeight: '1.4' }}>
          {message}
        </div>
        <div
          onClick={() => { setLeaving(true); setTimeout(onDismiss, 300) }}
          style={{ fontSize: '12px', color: '#6B6B6B', cursor: 'pointer', flexShrink: 0 }}
        >
          ×
        </div>
      </div>
    </div>
  )
}
