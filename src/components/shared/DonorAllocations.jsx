import { ENTITIES, getPrograms, getSubprograms, getDonors, validateAllocations } from '../../lib/donorData'
import PercentInput from './PercentInput'

// Multi-donor allocation editor. Each row splits the spend across a
// entity → programme → sub-programme → donor with a percentage.
// Percentages must total 100%. Reused by the PR form and the layer-2 expense form.
//
// props:
//   value:    array of { entity, program, subprogram, donor, percent }
//   onChange: (nextArray) => void
//   error:    optional error string to surface
//   lockEntity: optional entity to force on every row (expense form pins one entity)

const emptyRow = (entity = '') => ({ entity, program: '', subprogram: '', donor: '', percent: '' })

function cellSelect(val, onChange, options, placeholder, disabled) {
  return (
    <select
      value={val}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        width: '100%', height: '34px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
        padding: '0 8px', fontSize: '12px', color: val ? 'var(--ink)' : 'var(--text-muted)',
        background: disabled ? 'var(--taupe-100)' : 'var(--surface-card)', outline: 'none', boxSizing: 'border-box',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function cellInput(val, onChange, placeholder) {
  return (
    <input
      value={val}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', height: '34px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
        padding: '0 8px', fontSize: '12px', color: 'var(--ink)', background: 'var(--surface-card)',
        outline: 'none', boxSizing: 'border-box',
      }}
    />
  )
}

export default function DonorAllocations({ value = [], onChange, error, lockEntity = '' }) {
  const rows = value.length ? value : [emptyRow(lockEntity)]
  const { total, valid } = validateAllocations(rows)

  function update(idx, patch) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange(next)
  }

  // Once a PR is split across more than one allocation, every row shares the
  // same entity — only the first row's entity control stays editable; the
  // rest are locked to match it (same treatment as the caller-supplied
  // lockEntity prop, just derived from row 0 instead of a fixed value).
  function handleEntity(idx, val) {
    if (idx === 0) {
      onChange(rows.map(r => ({ ...r, entity: val, program: '', subprogram: '', donor: '' })))
      return
    }
    update(idx, { entity: val, program: '', subprogram: '', donor: '' })
  }
  function handleProgram(idx, val)    { update(idx, { program: val, subprogram: '', donor: '' }) }
  function handleSubprogram(idx, val) { update(idx, { subprogram: val, donor: '' }) }

  function addRow() { onChange([...rows, emptyRow(lockEntity || rows[0]?.entity || '')]) }
  function removeRow(idx) {
    const next = rows.filter((_, i) => i !== idx)
    onChange(next.length ? next : [emptyRow(lockEntity)])
  }

  const totalColor = total === 100 ? 'var(--moss-text)' : total > 100 ? 'var(--clay-text)' : 'var(--gold-text)'

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map((row, idx) => {
          const programs    = getPrograms(row.entity)
          const subprograms = getSubprograms(row.entity, row.program)
          const donors      = getDonors(row.entity, row.program, row.subprogram)
          return (
            <div key={idx} style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', padding: '12px', background: 'var(--taupe-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Allocation {idx + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    style={{ background: 'none', border: 'none', color: 'var(--clay-text)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>Entity</div>
                  {cellSelect(row.entity, v => handleEntity(idx, v), ENTITIES, 'Select entity…', !!lockEntity || idx > 0)}
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>Programme</div>
                  {programs.length > 0
                    ? cellSelect(row.program, v => handleProgram(idx, v), programs, 'Select…')
                    : cellInput(row.program, v => handleProgram(idx, v), 'e.g. Livelihood Program, Central')}
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>Sub-Programme</div>
                  {subprograms.length > 0
                    ? cellSelect(row.subprogram, v => handleSubprogram(idx, v), subprograms, 'Select…')
                    : cellInput(row.subprogram, v => handleSubprogram(idx, v), 'e.g. PMU, Prize')}
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>Donor</div>
                  {donors.length > 0
                    ? cellSelect(row.donor, v => update(idx, { donor: v }), donors, 'Select donor…')
                    : cellInput(row.donor, v => update(idx, { donor: v }), 'Enter donor name')}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Allocation</span>
                <PercentInput
                  value={row.percent}
                  onChange={v => update(idx, { percent: v })}
                  style={{ width: '90px' }}
                  inputStyle={{ height: '32px', fontSize: '12px' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        {total < 100 ? (
          <button
            type="button"
            onClick={addRow}
            style={{ background: 'none', border: '1px dashed var(--text-on-dark-muted)', color: 'var(--action)', fontSize: '12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', padding: '6px 12px' }}
          >
            + Add donor / programme
          </button>
        ) : <span />}
        <span style={{ fontSize: '12px', fontWeight: 600, color: totalColor }}>
          Total: {total}%{total !== 100 && ' (must be 100%)'}
        </span>
      </div>

      {error && !valid && (
        <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '6px' }}>{error}</div>
      )}
    </div>
  )
}
