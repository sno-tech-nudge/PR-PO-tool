import { ENTITIES, getPrograms, getSubprograms, getDonors, validateAllocations } from '../../lib/donorData'

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
        width: '100%', height: '34px', border: '1px solid #D1D5DB', borderRadius: '4px',
        padding: '0 8px', fontSize: '12px', color: val ? '#1A1F36' : '#9CA3AF',
        background: disabled ? '#F3F4F6' : '#FFFFFF', outline: 'none', boxSizing: 'border-box',
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
        width: '100%', height: '34px', border: '1px solid #D1D5DB', borderRadius: '4px',
        padding: '0 8px', fontSize: '12px', color: '#1A1F36', background: '#FFFFFF',
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

  function handleEntity(idx, val)     { update(idx, { entity: val, program: '', subprogram: '', donor: '' }) }
  function handleProgram(idx, val)    { update(idx, { program: val, subprogram: '', donor: '' }) }
  function handleSubprogram(idx, val) { update(idx, { subprogram: val, donor: '' }) }

  function addRow() { onChange([...rows, emptyRow(lockEntity)]) }
  function removeRow(idx) {
    const next = rows.filter((_, i) => i !== idx)
    onChange(next.length ? next : [emptyRow(lockEntity)])
  }

  const totalColor = total === 100 ? '#15803D' : total > 100 ? '#B91C1C' : '#B45309'

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map((row, idx) => {
          const programs    = getPrograms(row.entity)
          const subprograms = getSubprograms(row.entity, row.program)
          const donors      = getDonors(row.entity, row.program, row.subprogram)
          return (
            <div key={idx} style={{ border: '1px solid #E3E8EF', borderRadius: '6px', padding: '12px', background: '#F9FAFB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280' }}>Allocation {idx + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    style={{ background: 'none', border: 'none', color: '#B91C1C', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '3px' }}>Entity</div>
                  {cellSelect(row.entity, v => handleEntity(idx, v), ENTITIES, 'Select entity…', !!lockEntity)}
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '3px' }}>Programme</div>
                  {programs.length > 0
                    ? cellSelect(row.program, v => handleProgram(idx, v), programs, 'Select…')
                    : cellInput(row.program, v => handleProgram(idx, v), 'e.g. CSI, EIP')}
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '3px' }}>Sub-Programme</div>
                  {subprograms.length > 0
                    ? cellSelect(row.subprogram, v => handleSubprogram(idx, v), subprograms, 'Select…')
                    : cellInput(row.subprogram, v => handleSubprogram(idx, v), 'e.g. CSI - Prize')}
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '3px' }}>Donor</div>
                  {donors.length > 0
                    ? cellSelect(row.donor, v => update(idx, { donor: v }), donors, 'Select donor…')
                    : cellInput(row.donor, v => update(idx, { donor: v }), 'Enter donor name')}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: '#9CA3AF' }}>Allocation %</span>
                <input
                  type="number"
                  value={row.percent}
                  onChange={e => update(idx, { percent: e.target.value })}
                  placeholder="0"
                  min="0"
                  max="100"
                  style={{ width: '90px', height: '32px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 8px', fontSize: '12px', color: '#1A1F36', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '12px', color: '#6B7280' }}>%</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <button
          type="button"
          onClick={addRow}
          style={{ background: 'none', border: '1px dashed #C4826F', color: '#8C3225', fontSize: '12px', cursor: 'pointer', borderRadius: '4px', padding: '6px 12px' }}
        >
          + Add donor / programme
        </button>
        <span style={{ fontSize: '12px', fontWeight: 600, color: totalColor }}>
          Total: {total}%{total !== 100 && ' (must be 100%)'}
        </span>
      </div>

      {error && !valid && (
        <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '6px' }}>{error}</div>
      )}
    </div>
  )
}
