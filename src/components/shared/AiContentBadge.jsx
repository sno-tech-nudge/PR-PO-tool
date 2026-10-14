// A small label for an image that is clearly AI-generated. Informational only.
export default function AiContentBadge({ style }) {
  return (
    <span
      title="This image appears to be AI-generated"
      style={{
        display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.03em', padding: '2px 7px',
        borderRadius: 'var(--radius-xs)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', color: 'var(--gold-text)',
        whiteSpace: 'nowrap', ...style,
      }}
    >
      AI content
    </span>
  )
}

// The wording under an upload when its image was marked, kept to one short line.
export function AiContentNote({ name }) {
  return (
    <div role="status" style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.5, color: 'var(--gold-text)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
      <AiContentBadge style={{ marginRight: '8px' }} />
      {name ? `“${name}” appears` : 'This image appears'} to be AI-generated. It is still saved, and the approvers will see this label.
    </div>
  )
}
