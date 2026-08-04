export default function PolicyLoading() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: '16px',
      background: '#FFFFFF',
    }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        border: '3px solid #E8E8E8', borderTopColor: '#1A1A1A',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '15px', color: '#4A4A4A' }}>Checking your expenses</div>
      <div style={{ fontSize: '12px', color: '#6B6B6B' }}>This takes a few seconds</div>
    </div>
  )
}
