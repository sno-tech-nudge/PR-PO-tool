// Plain-language, actionable guidance per detected issue — telling someone
// their photo is merely "blurry" doesn't tell them what to actually do
// differently on the retake.
const ISSUE_GUIDANCE = {
  blurry: 'This photo looks blurry. Hold your phone steady, get a little closer to the receipt, and make sure it’s in focus before taking the photo.',
  dark: 'This photo is too dark to read clearly. Try taking it somewhere brighter, or turn on your flash.',
  cropped: 'Part of the receipt looks like it’s cut off. Make sure the whole receipt fits inside the frame before taking the photo.',
}

export default function QualityCheck({ issue, onRetake, onUseAnyway }) {
  const guidance = ISSUE_GUIDANCE[issue] || 'This photo may be hard to read clearly.'

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
          {guidance} A clearer photo also helps Finance verify it faster.
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
