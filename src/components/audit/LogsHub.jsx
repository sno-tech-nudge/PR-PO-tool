import { useState } from 'react'
import ViewTabs from '../shared/ViewTabs'
import ActivityLog from './ActivityLog'
import SystemLogs from './SystemLogs'

// One tab, two logs: what people did in the tool (Activity Log) and changes to
// the system itself (System Logs). Admin only, like both of them.
export default function LogsHub({ user }) {
  const [view, setView] = useState('activity')
  return (
    <div>
      <ViewTabs items={[['activity', 'Activity Log'], ['system', 'System Logs']]} value={view} onChange={setView} />
      {view === 'activity' ? <ActivityLog user={user} /> : <SystemLogs user={user} />}
    </div>
  )
}
