export default function PolicyLoading() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: '16px',
      background: 'var(--surface-card)',
    }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        border: '3px solid var(--taupe-200)', borderTopColor: 'var(--text)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '15px', color: 'var(--text-muted)' }}>Checking your expenses</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This takes a few seconds</div>
    </div>
  )
}
