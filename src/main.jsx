import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A focused native <input type="number"> changes its value on mouse-wheel
// scroll by default — a frequent source of silently-wrong amounts when
// someone scrolls past a numeric field. Blurring it on wheel (global, so it
// covers every number input app-wide, current and future) makes the wheel
// just scroll the page instead, like every other field.
document.addEventListener('wheel', () => {
  const el = document.activeElement
  if (el instanceof HTMLInputElement && el.type === 'number') el.blur()
}, { passive: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
