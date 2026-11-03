import GuidedTour from './GuidedTour'
import { tourForRole } from '../../lib/tours'

// The first-visit tour: shown once automatically, with Help in the account menu to replay it any
// time. Finance gets its own (where approvals, vouching and payments are); everyone else gets the
// Home tour. See GuidedTour.jsx for the mechanics and lib/tours.js for the steps.
export default function FirstTimeWalkthrough({ open, onClose, role, onStepChange }) {
  const { key, steps } = tourForRole(role)
  return <GuidedTour steps={steps} open={open} onClose={onClose} tourKey={key} onStepChange={onStepChange} />
}
