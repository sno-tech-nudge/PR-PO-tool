import { useState, useEffect } from 'react'

const BREAKPOINT = '(max-width: 768px)'

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(BREAKPOINT).matches)

  useEffect(() => {
    const mql = window.matchMedia(BREAKPOINT)
    const handleChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
