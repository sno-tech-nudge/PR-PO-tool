import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { preloadDirectory, getActiveDirectoryEntries } from '../../lib/directory'
import AttendeeMultiSelect from '../shared/AttendeeMultiSelect'

// Asked on a food or hotel policy flag when the bill is over the per-person
// limit as it stands: was it really for one person, or shared by a group?
// A group answer (head count + names) is saved to the expense and its policy
// checks re-run against the per-person amount; "just me" confirms the flag.
export default function HeadcountAsk({ expense, onApplied, onSolo }) {
  const [choice, setChoice] = useState(null) // null | 'group'
  const [count, setCount] = useState(null) // 2..6 or '7+'
  const [customCount, setCustomCount] = useState('')
  const [attendees, setAttendees] = useState([])
  const [directory, setDirectory] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { preloadDirectory().then(() => setDirectory(getActiveDirectoryEntries())) }, [])

  const people = count === '7+' ? (parseInt(customCount) || 0) : (count || 0)
  const perPerson = people > 1 && expense.amount ? Math.round(Number(expense.amount) / people) : null
  const ready = people > 1 && attendees.length > 0

  async function apply() {
    if (!ready) { setError('Choose how many people and add at least one name.'); return }
    setSaving(true)
    setError(null)
    const patch = {
      expense_type: 'my_team',
      attendee_count: people,
      per_person_amount: perPerson,
      attendee_names: attendees.map(a => a.name).join(', '),
      attendees,
    }
    const { data, error: err } = await supabase.from('expense_details').update(patch).eq('id', expense.id).select().single()
    setSaving(false)
    if (err) { setError(`Could not save: ${err.message}`); return }
    onApplied({ ...expense, ...(data || patch) })
  }

  const tile = (key, label, sub, onClick, active) => (
    <div
      key={key}
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 10px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
        border: `1.5px solid ${active ? 'var(--text)' : 'var(--taupe-200)'}`,
        background: active ? 'var(--taupe-50)' : 'var(--surface-card)',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{label}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{sub}</div>
    </div>
  )

  return (
    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--clay-border)' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
        Was this bill for more than one person?
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {tile('solo', 'Just me', 'Personal expense', () => onSolo(), false)}
        {tile('group', 'Multiple people', 'Team or group', () => setChoice('group'), choice === 'group')}
      </div>

      {choice === 'group' && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>How many people including you</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[2, 3, 4, 5, 6, '7+'].map(n => (
              <div
                key={n}
                onClick={() => setCount(n)}
                style={{
                  width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  border: `1.5px solid ${count === n ? 'var(--text)' : 'var(--taupe-200)'}`,
                  background: count === n ? 'var(--text)' : 'var(--surface-card)',
                  color: count === n ? 'var(--surface-card)' : 'var(--text)',
                  fontSize: '13px', fontWeight: 500, borderRadius: 'var(--radius-sm)',
                }}
              >
                {n}
              </div>
            ))}
          </div>
          {count === '7+' && (
            <input
              type="number"
              value={customCount}
              onChange={e => setCustomCount(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter number"
              style={{ width: '140px', height: '40px', marginTop: '8px', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: '13px', background: 'var(--surface-card)', boxSizing: 'border-box' }}
            />
          )}
          {perPerson && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>₹{perPerson.toLocaleString('en-IN')} per person</div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '10px 0 4px' }}>Names of attendees</div>
          <AttendeeMultiSelect selected={attendees} onChange={setAttendees} directoryEntries={directory} />
          {error && <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '6px' }}>{error}</div>}
          <button
            type="button"
            onClick={apply}
            disabled={saving}
            style={{
              height: '38px', padding: '0 18px', marginTop: '10px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: saving ? 'var(--text-muted)' : 'var(--action)', color: 'var(--surface-card)', fontSize: '13px', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      )}
    </div>
  )
}
