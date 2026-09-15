import { useState, useEffect } from 'react'

export default function GeneratingPDF({ visible, text = 'Preparing your report' }) {
  const [longRunning, setLongRunning] = useState(false)

  useEffect(() => {
    if (!visible) {
      setLongRunning(false)
      return
    }
    const timer = setTimeout(() => setLongRunning(true), 4000)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(255, 255, 255, 0.92)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '12px', zIndex: 1000,
    }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%',
        border: '2px solid var(--taupe-200)', borderTopColor: 'var(--text)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{text}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        {longRunning ? 'Almost ready' : 'This takes a moment'}
      </div>
    </div>
  )
}
