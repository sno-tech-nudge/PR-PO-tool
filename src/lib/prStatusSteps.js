// Builds the step list PRStatusTimeline.jsx renders on-screen — extracted
// so src/lib/prApprovalActions.js can build the exact same steps for the
// status-update emails, instead of the email inventing its own visual.

const GENERIC_STEPS = ['Draft', 'Submitted', 'Approved', 'PO Issued']

const STATUS_STEP = {
  draft:         0,
  submitted:     1,
  approved:      2,
  po_generated:  3,
  rejected:     -1,
}

// Fallback used when no pr_approvals rows are available — collapses every
// approval level into one generic "Approved" step.
export function buildGenericSteps(status) {
  const currentStep = STATUS_STEP[status] ?? 0
  if (currentStep === -1) {
    return GENERIC_STEPS.map((label, i) => ({ label: i === 1 ? 'Rejected' : label, state: i === 1 ? 'rejected' : 'waiting' }))
  }
  return GENERIC_STEPS.map((label, i) => ({
    label,
    state: i < currentStep ? 'done' : i === currentStep ? 'current' : 'waiting',
  }))
}

// One step per actual approval level (Functional Leader, COO, ...) instead of
// collapsing them all into a single "Approved" step.
export function buildLevelAwareSteps(status, approvals) {
  const isRejected = status === 'rejected'
  const levelSteps = approvals.map(a => ({
    label: a.approver_name,
    state: a.status === 'approved' ? 'done' : a.status === 'rejected' ? 'rejected' : a.status === 'pending' ? 'current' : 'waiting',
  }))
  const steps = [{ label: 'Submitted', state: 'done' }, ...levelSteps]
  if (!isRejected) {
    steps.push({ label: 'PO Issued', state: status === 'po_generated' ? 'done' : status === 'approved' ? 'current' : 'waiting' })
  }
  return steps
}

// Convenience for callers that just have (status, approvals) and want
// whichever variant PRStatusTimeline.jsx itself would pick.
export function buildPRTimelineSteps(status, approvals) {
  return approvals && approvals.length > 0 ? buildLevelAwareSteps(status, approvals) : buildGenericSteps(status)
}
