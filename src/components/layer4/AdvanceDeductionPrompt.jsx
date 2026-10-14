import ReasonChips from '../shared/ReasonChips'
import AdvancePicker from '../shared/AdvancePicker'
import { money } from '../../lib/advanceBalance'

const NO_REASONS = ['The advance is for a different trip', 'I will settle the advance separately', 'This spend is not related to the advance']

// Shown in the report preview only when the person has an advance with money
// left, said the report is not tied to one, and has out-of-pocket spend in it.
// One question; the reason for "No" is optional.
export default function AdvanceDeductionPrompt({ advances, spend, choice, onChoice, selected, onSelected, reason, onReason }) {
  const open = advances.filter(a => a.remaining > 0)
  const left = open.reduce((s, a) => s + a.remaining, 0)
  const btn = active => ({
    flex: 1, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit',
    border: `1.5px solid ${active ? 'var(--text)' : 'var(--taupe-200)'}`, background: active ? 'var(--taupe-50)' : 'var(--surface-card)',
  })
  return (
    <div style={{ border: '1px solid var(--gold-border)', background: 'var(--gold-bg)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginTop: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gold-text)', marginBottom: '2px' }}>You have an advance with {money(left)} left</div>
      <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, marginBottom: '10px' }}>
        Should this report be deducted from it? Your manager and the Finance team will see your answer.
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={() => onChoice('deduct')} style={btn(choice === 'deduct')}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>Yes, deduct it</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Settle against my advance</div>
        </button>
        <button type="button" onClick={() => onChoice('no')} style={btn(choice === 'no')}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>No</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Reimburse me in full</div>
        </button>
      </div>

      {choice === 'deduct' && (
        <div style={{ marginTop: '12px' }}>
          {open.length > 1 && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Which advance? Pick more than one if this is more than one covers.</div>}
          <AdvancePicker advances={advances} selected={selected} onChange={onSelected} spend={spend} />
        </div>
      )}

      {choice === 'no' && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Want to say why? This is optional.</div>
          <ReasonChips options={NO_REASONS} value={reason} onChange={onReason} />
        </div>
      )}
    </div>
  )
}
