import { useNetworkStatus } from '../../hooks/useNetworkStatus'

export default function OfflineBanner() {
  const { isOnline } = useNetworkStatus()
  if (isOnline) return null
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      background: 'var(--gold-bg)',
      borderBottom: '1px solid var(--gold-text)',
      padding: '8px',
      textAlign: 'center',
      fontSize: '12px',
      color: 'var(--gold-text)',
    }}>
      You are offline. Documents will be saved to your device.
    </div>
  )
}
