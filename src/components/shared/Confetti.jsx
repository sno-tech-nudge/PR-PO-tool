import { useEffect, useState } from 'react'

const COLORS = ['#8C3225', '#16A34A', '#CA8A04', '#2563EB', '#DB2777']

// Small celebratory burst — plain CSS, no charting/animation library. Fires
// once on mount, removes itself after the fall animation finishes so it
// never lingers or blocks clicks on the page underneath.
export default function Confetti({ pieceCount = 60, duration = 2600 }) {
  const [visible, setVisible] = useState(true)
  const [pieces] = useState(() =>
    Array.from({ length: pieceCount }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      fallDuration: 1.8 + Math.random() * 1.2,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 80,
      size: 6 + Math.random() * 5,
    }))
  )

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(t)
  }, [duration])

  if (!visible) return null

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 200 }}>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-10px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute', top: 0, left: `${p.left}%`,
            width: `${p.size}px`, height: `${p.size * 0.4}px`,
            background: p.color,
            '--drift': `${p.drift}px`,
            animation: `confetti-fall ${p.fallDuration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  )
}
