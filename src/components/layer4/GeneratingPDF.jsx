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
        border: '2px solid #E8E8E8', borderTopColor: '#1A1A1A',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '14px', color: '#4A4A4A' }}>{text}</div>
      <div style={{ fontSize: '12px', color: '#6B6B6B' }}>
        {longRunning ? 'Almost ready' : 'This takes a moment'}
      </div>
    </div>
  )
}
