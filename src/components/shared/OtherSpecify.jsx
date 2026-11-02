import { OTHER_CATEGORY } from '../../lib/expenseCategories'

// Shown straight under a category picker when "Other" is chosen, so the record
// says what "Other" actually is. Renders nothing for any other category.
export default function OtherSpecify({ category, value, onChange, error, required = true, label = 'What is this?', placeholder = 'Say what it is, e.g. stage hire for the event', style, suggest = null, onUseCategory }) {
  if (category !== OTHER_CATEGORY) return null
  return (
    <div style={{ marginTop: '8px', ...style }}>
      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {label}{required && <span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>}
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        maxLength={80}
        placeholder={placeholder}
        aria-label="What Other means"
        style={{
          width: '100%', height: '36px', boxSizing: 'border-box', border: `1px solid ${error ? 'var(--clay-text)' : 'var(--taupe-300)'}`,
          borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', color: 'var(--ink)', background: 'var(--surface-card)', outline: 'none', fontFamily: 'inherit',
        }}
      />
      {error && <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '4px' }}>{error}</div>}
      {suggest && onUseCategory && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          &ldquo;{suggest}&rdquo; is a category now.{' '}
          <span role="button" onClick={() => onUseCategory(suggest)} style={{ color: 'var(--action)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>Use it instead</span>
        </div>
      )}
    </div>
  )
}
