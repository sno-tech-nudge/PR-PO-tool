import { advanceValidity, todayStr } from '../../lib/formCalc'
import PercentInput from '../shared/PercentInput'
import QuoteUpload from './QuoteUpload'

const CREDIT_TERM_OPTIONS = ['Net 15 Days', 'Net 30 Days', 'Net 45 Days', 'Net 60 Days', 'Net 90 Days']

// Advance-payment split: advance % (a) + after-delivery % (b) = 100%.
// after-delivery auto-complements to 100. > 30% advance is flagged (warn, allowed).
// 100% advance requires FL approval over email → notice + required
// acknowledgement + an attached screenshot of that approval email.
// Credit term (frequency + due date, covering the after-delivery portion)
// is a single mandatory field pair shown right under the Total row, not a
// separate/optional payment method — it reveals as soon as an advance % has
// been entered (which is immediately, since the field defaults to 30).
// Callers derive validity via advanceValidity() from lib/formCalc.
//
// value:    { advancePercent, flEmailAck, screenshotPath, creditTermFrequency, creditTermDate }
// onChange: (nextValue) => void

export default function AdvanceTable({ value = {}, onChange, error }) {
  const { advance, afterDelivery, flaggedOver30, requiresFLEmail, creditTermApplicable } = advanceValidity(value)
  const set = patch => onChange({ ...value, ...patch })
  const advanceEntered = value.advancePercent !== '' && value.advancePercent != null

  // 100% advance leaves nothing for a credit term to cover — clear any
  // previously-entered credit term as soon as the advance reaches 100 so a
  // stale frequency/date can't linger unseen behind the greyed-out fields.
  function setAdvancePercent(v) {
    const patch = { advancePercent: v }
    if (Number(v) === 100) { patch.creditTermFrequency = ''; patch.creditTermDate = '' }
    set(patch)
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>Advance Split</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>Defaults to 30% — adjust if needed.</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: 'var(--taupe-50)' }}>
            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>Milestone</th>
            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right', width: '120px' }}>%</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderTop: '1px solid var(--taupe-100)' }}>
            <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--ink)' }}>Advance (on PO)</td>
            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
              <PercentInput
                value={value.advancePercent ?? ''}
                onChange={setAdvancePercent}
                style={{ width: '90px', marginLeft: 'auto' }}
                inputStyle={{ height: '32px' }}
              />
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--taupe-100)' }}>
            <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--ink)' }}>After delivery / completion</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{afterDelivery}%</td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--taupe-200)', background: 'var(--taupe-50)' }}>
            <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Total</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{advance + afterDelivery}%</td>
          </tr>
        </tbody>
      </table>

      {advanceEntered && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: creditTermApplicable ? 'var(--ink)' : 'var(--text-muted)', marginBottom: '8px' }}>
            Credit Term{!creditTermApplicable && <span style={{ fontWeight: 400, fontStyle: 'italic' }}> — not applicable at 100% advance</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', opacity: creditTermApplicable ? 1 : 0.5 }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>
                Frequency{creditTermApplicable && <span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>}
              </label>
              <select
                value={value.creditTermFrequency || ''}
                onChange={e => set({ creditTermFrequency: e.target.value })}
                disabled={!creditTermApplicable}
                style={{
                  width: '100%', height: '36px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)',
                  padding: '0 10px', fontSize: '13px', color: value.creditTermFrequency ? 'var(--ink)' : 'var(--text-muted)',
                  background: creditTermApplicable ? 'var(--surface-card)' : 'var(--taupe-100)', outline: 'none', boxSizing: 'border-box',
                  cursor: creditTermApplicable ? 'auto' : 'not-allowed',
                }}
              >
                <option value="">Select credit term…</option>
                {CREDIT_TERM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>
                Due Date{creditTermApplicable && <span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>}
              </label>
              <input
                type="date"
                value={value.creditTermDate || ''}
                min={todayStr()}
                onChange={e => set({ creditTermDate: e.target.value })}
                disabled={!creditTermApplicable}
                style={{
                  width: '100%', height: '36px', border: '1px solid var(--taupe-400)', borderRadius: 'var(--radius-sm)', padding: '0 10px',
                  fontSize: '13px', color: 'var(--ink)', background: creditTermApplicable ? 'var(--surface-card)' : 'var(--taupe-100)',
                  outline: 'none', boxSizing: 'border-box', cursor: creditTermApplicable ? 'auto' : 'not-allowed',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {flaggedOver30 && !requiresFLEmail && (
        <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--gold-text)', lineHeight: 1.6 }}>
            ⚠ Advance of <strong>{advance}%</strong> exceeds the 30% guideline. You may still submit, but expect
            additional scrutiny from the approver.
          </div>
        </div>
      )}

      {requiresFLEmail && (
        <div style={{ background: 'var(--clay-bg)', border: '1px solid var(--clay-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--clay-text)', lineHeight: 1.6, marginBottom: '10px' }}>
            <strong>100% advance</strong> requires explicit <strong>Functional Leader approval over email</strong>{' '}
            before this PR can proceed. FL will still action the approval in-app.
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--clay-text)' }}>
            <input
              type="checkbox"
              checked={!!value.flEmailAck}
              onChange={e => set({ flEmailAck: e.target.checked })}
              style={{ width: '15px', height: '15px', marginTop: '1px' }}
            />
            I confirm Functional Leader email approval has been / will be obtained for this 100% advance.
          </label>

          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--clay-border)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--clay-text)', marginBottom: '8px' }}>
              Attach screenshot of FL approval email<span style={{ color: 'var(--clay-text)', marginLeft: '2px' }}>*</span>
            </div>
            <QuoteUpload skipExtraction onFileUploaded={path => set({ screenshotPath: path })} />
            <div style={{ fontSize: '11px', color: value.screenshotPath ? 'var(--moss-text)' : 'var(--clay-text)', marginTop: '6px' }}>
              {value.screenshotPath ? '✓ Screenshot uploaded' : 'Screenshot not uploaded'}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: 'var(--clay-text)', marginTop: '8px' }}>{error}</div>
      )}
    </div>
  )
}
