// Plain per-device "have I seen this" marker for FirstTimeWalkthrough.jsx —
// same localStorage idiom as ReportStatus.jsx's "celebrated_report_" flag,
// wrapped in try/catch for private-browsing/blocked-storage safety.
export const WALKTHROUGH_SEEN_KEY = 'nudge_walkthrough_seen_v1'

export function hasSeenWalkthrough() {
  try {
    return !!localStorage.getItem(WALKTHROUGH_SEEN_KEY)
  } catch {
    return false
  }
}

export function markWalkthroughSeen() {
  try {
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, '1')
  } catch { /* private-browsing or storage disabled — just won't persist, no crash */ }
}
