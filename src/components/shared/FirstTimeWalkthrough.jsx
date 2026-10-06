import GuidedTour from './GuidedTour'
import { HOME_TOUR } from '../../lib/tours'

// The Home-screen tour: shown once automatically on a first visit, with the
// sidebar's "?" button to replay it any time. See GuidedTour.jsx for the
// mechanics and lib/tours.js for the steps.
export default function FirstTimeWalkthrough({ open, onClose }) {
  return <GuidedTour steps={HOME_TOUR} open={open} onClose={onClose} tourKey="home" />
}
