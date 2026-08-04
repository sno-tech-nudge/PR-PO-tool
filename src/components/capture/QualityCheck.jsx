export default function QualityCheck({ issue, onRetake, onUseAnyway }) {
  const issueText = issue === 'blurry' ? 'blurry' : issue === 'dark' ? 'too dark' : issue === 'cropped' ? 'cropped' : issue

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 40,
      padding: '20px',
    }}>
      <div style={{
        background: '#FFFFFF',
        padding: '24px',
        maxWidth: '360px',
        width: '100%',
        borderRadius: '4px',
      }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: '#1A1A1A', marginBottom: '8px' }}>
          Document may be hard to read
        </div>
        <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '20px' }}>
          This photo appears to be {issueText}. Finance may not be able to verify it.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onRetake}
            style={{
              width: '100%',
              height: '44px',
              border: '1px solid #E8E8E8',
              background: '#FFFFFF',
              color: '#1A1A1A',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              borderRadius: '4px',
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
              background: '#8C3225',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            Use anyway
          </button>
        </div>
      </div>
    </div>
  )
}
