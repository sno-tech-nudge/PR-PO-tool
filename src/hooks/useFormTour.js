import { useState, useEffect } from 'react'
import { hasSeenTour } from '../lib/walkthrough'

// Open/close state for a form's guided tour: opens by itself the first time
// this browser sees the form, and `start` reopens it on demand (the "Take a
// tour" button). Seen-tracking itself is done by GuidedTour on finish/skip.
export function useFormTour(tourKey, { enabled = true } = {}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!enabled || hasSeenTour(tourKey)) return
    // Brief delay so the form has rendered and its anchors exist.
    const t = setTimeout(() => setOpen(true), 800)
    return () => clearTimeout(t)
  }, [tourKey, enabled])

  return { open, start: () => setOpen(true), close: () => setOpen(false) }
}
