// Shared "attachment box" look — a clickable dashed box instead of a bare
// native file input, matching the style VendorForm.jsx's own FileUpload
// already uses. Presentational only: callers keep whatever upload/extraction
// logic they already had, this just replaces the <input type="file"> markup.
export default function AttachmentDropzone({
  accept = 'image/*,.pdf',
  file,
  onChange,
  placeholder = 'Click to select file (PDF or image)',
  uploadedLabel,
  disabled = false,
}) {
  const hasFile = !!(file || uploadedLabel)
  return (
    <label
      style={{
        display: 'block', cursor: disabled ? 'default' : 'pointer',
        border: `2px dashed ${hasFile ? '#15803D' : '#D1D5DB'}`,
        borderRadius: '6px', padding: '16px', textAlign: 'center',
        background: hasFile ? '#F0FDF4' : '#FAFAFA',
        opacity: disabled ? 0.6 : 1, transition: '0.15s', boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: '12px', color: hasFile ? '#15803D' : '#6B7280', marginBottom: hasFile ? 0 : '8px' }}>
        {file ? `✓ ${file.name}` : uploadedLabel ? `✓ ${uploadedLabel}` : placeholder}
      </div>
      {!hasFile && (
        <span style={{
          display: 'inline-block', padding: '5px 14px', background: '#FFFFFF',
          border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px',
          color: '#374151', fontWeight: 500,
        }}>
          Choose File
        </span>
      )}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={e => onChange(e.target.files?.[0] || null)}
        style={{ display: 'none' }}
      />
    </label>
  )
}
