// Plain per-device "have I seen this" markers for the guided tours — same
// localStorage idiom as ReportStatus.jsx's "celebrated_report_" flag, wrapped
// in try/catch for private-browsing/blocked-storage safety.
export const WALKTHROUGH_SEEN_KEY = 'nudge_walkthrough_seen_v1'

// The Home tour keeps its original key (so nobody who already dismissed it is
// shown it again); every other tour gets its own.
const keyFor = tour => (tour === 'home' ? WALKTHROUGH_SEEN_KEY : `nudge_tour_${tour}_seen_v1`)

export function hasSeenTour(tour) {
  try {
    return !!localStorage.getItem(keyFor(tour))
  } catch {
    return false
  }
}

export function markTourSeen(tour) {
  try {
    localStorage.setItem(keyFor(tour), '1')
  } catch { /* private-browsing or storage disabled — just won't persist, no crash */ }
}

export const hasSeenWalkthrough = () => hasSeenTour('home')
export const markWalkthroughSeen = () => markTourSeen('home')
