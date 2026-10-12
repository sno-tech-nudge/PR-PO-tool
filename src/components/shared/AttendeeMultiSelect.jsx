import { useState } from 'react'

// Searchable multi-select for expense attendees — matches against the org
// directory (active Zoho accounts only, already preloaded/cached by
// App.jsx) so most names are a couple keystrokes away, but also lets
// someone add a typed name outside the directory (a donor rep, an external
// guest) since not every attendee is a Nudge team member. Each selected
// entry is {name, email} — email is null for a free-text addition — so a
// person can be looked up by email later rather than just matched by name.
export default function AttendeeMultiSelect({ selected, onChange, directoryEntries }) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const filtered = trimmed
    ? directoryEntries
        .filter(d => d.name.toLowerCase().includes(trimmed.toLowerCase()) && !selected.some(s => s.email === d.email))
        .slice(0, 8)
    : []
  const exactMatch = trimmed && (
    filtered.some(d => d.name.toLowerCase() === trimmed.toLowerCase()) ||
    selected.some(s => s.name.toLowerCase() === trimmed.toLowerCase())
  )

  function addAttendee(name, email = null) {
    const clean = name.trim()
    if (!clean || selected.some(s => s.name.toLowerCase() === clean.toLowerCase())) { setQuery(''); return }
    onChange([...selected, { name: clean, email }])
    setQuery('')
  }
  function removeAttendee(name) {
    onChange(selected.filter(s => s.name !== name))
  }

  const inputStyle = {
    width: '100%', height: '44px', border: '1px solid var(--taupe-200)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: '14px',
    color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--surface-card)', fontFamily: 'inherit',
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && trimmed) { e.preventDefault(); addAttendee(trimmed) } }}
        placeholder="Search team members or type a name"
        style={inputStyle}
      />
      {trimmed && (
        <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginTop: '4px', overflow: 'hidden' }}>
          {filtered.map(d => (
            <div
              key={d.email}
              onClick={() => addAttendee(d.name, d.email)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--taupe-100)', display: 'flex', justifyContent: 'space-between' }}
            >
              <span>{d.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{d.email}</span>
            </div>
          ))}
          {!exactMatch && (
            <div
              onClick={() => addAttendee(trimmed)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--action)' }}
            >
              + Add "{trimmed}" (not in directory)
            </div>
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
          {selected.map(a => (
            <span
              key={a.name}
              title={a.email || ''}
              style={{
                fontSize: '12px', color: 'var(--ink)', background: 'var(--taupe-100)',
                borderRadius: 'var(--radius-sm)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {a.name}
              <span onClick={() => removeAttendee(a.name)} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
