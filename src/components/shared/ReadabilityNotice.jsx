const REASON = {
  blurry: 'It looks blurry.',
  dark: 'It looks very dark.',
  blank: 'It looks blank or cropped.',
}

// A gentle heads-up for when the text reader could not get anything at all
// out of a photo or attachment. It never blocks: the person can carry on and
// fill things in themselves, or swap in a clearer photo.
export default function ReadabilityNotice({ name, issue, onRetry, retryLabel = 'Choose another', onDismiss, extra }) {
  return (
    <div
      role="status"
      style={{
        background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)',
        padding: '10px 12px', fontSize: '12px', lineHeight: 1.5, color: 'var(--ink)', marginTop: '8px',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--gold-text)', marginBottom: '2px' }}>
        We couldn&apos;t read any text from {name ? `“${name}”` : 'this photo'}
      </div>
      <div>
        {REASON[issue] || 'It may be blurry, too dark, cropped or not a bill.'} A clearer photo, taken straight on in good light, usually works.
        {extra ? ` ${extra}` : ' You can also carry on and fill in the details yourself.'}
      </div>
      {(onRetry || onDismiss) && (
        <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
          {onRetry && (
            <span onClick={onRetry} role="button" style={{ fontWeight: 600, color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline' }}>{retryLabel}</span>
          )}
          {onDismiss && (
            <span onClick={onDismiss} role="button" style={{ color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Dismiss</span>
          )}
        </div>
      )}
    </div>
  )
}
