export default function QualityCheck({ issue, onRetake, onUseAnyway }) {
  const issueText = issue === 'blurry' ? 'blurry' : issue === 'dark' ? 'too dark' : issue === 'cropped' ? 'cropped' : issue

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(54, 32, 26,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 40,
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--surface-card)',
        padding: '24px',
        maxWidth: '360px',
        width: '100%',
        borderRadius: 'var(--radius-sm)',
      }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text)', marginBottom: '8px' }}>
          Document may be hard to read
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          This photo appears to be {issueText}. Finance may not be able to verify it.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onRetake}
            style={{
              width: '100%',
              height: '44px',
              border: '1px solid var(--taupe-200)',
              background: 'var(--surface-card)',
              color: 'var(--text)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Retake
          </button>
          <button
            onClick={onUseAnyway}
            style={{
              width: '100%',
              height: '44px',
              border: 'none',
              background: 'var(--action)',
              color: 'var(--surface-card)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Use anyway
          </button>
        </div>
      </div>
    </div>
  )
}
