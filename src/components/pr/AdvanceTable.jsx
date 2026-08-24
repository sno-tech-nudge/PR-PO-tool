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
  const { advance, afterDelivery, flaggedOver30, requiresFLEmail } = advanceValidity(value)
  const set = patch => onChange({ ...value, ...patch })
  const advanceEntered = value.advancePercent !== '' && value.advancePercent != null

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Advance Split</div>
      <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '10px' }}>Defaults to 30% — adjust if needed.</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E3E8EF', borderRadius: '6px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#F8F9FA' }}>
            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#6B7280', textAlign: 'left' }}>Milestone</th>
            <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#6B7280', textAlign: 'right', width: '120px' }}>%</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderTop: '1px solid #F3F4F6' }}>
            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#374151' }}>Advance (on PO)</td>
            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
              <PercentInput
                value={value.advancePercent ?? ''}
                onChange={v => set({ advancePercent: v })}
                style={{ width: '90px', marginLeft: 'auto' }}
                inputStyle={{ height: '32px' }}
              />
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid #F3F4F6' }}>
            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#374151' }}>After delivery / completion</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#1A1F36' }}>{afterDelivery}%</td>
          </tr>
          <tr style={{ borderTop: '1px solid #E3E8EF', background: '#F8F9FA' }}>
            <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>Total</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#1A1F36' }}>{advance + afterDelivery}%</td>
          </tr>
        </tbody>
      </table>

      {advanceEntered && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Credit Term</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '5px' }}>
                Frequency<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
              </label>
              <select
                value={value.creditTermFrequency || ''}
                onChange={e => set({ creditTermFrequency: e.target.value })}
                style={{
                  width: '100%', height: '36px', border: '1px solid #D1D5DB', borderRadius: '4px',
                  padding: '0 10px', fontSize: '13px', color: value.creditTermFrequency ? '#1A1F36' : '#9CA3AF',
                  background: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
                }}
              >
                <option value="">Select credit term…</option>
                {CREDIT_TERM_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '5px' }}>
                Due Date<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
              </label>
              <input
                type="date"
                value={value.creditTermDate || ''}
                min={todayStr()}
                onChange={e => set({ creditTermDate: e.target.value })}
                style={{ width: '100%', height: '36px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#1A1F36', background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>
      )}

      {flaggedOver30 && !requiresFLEmail && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '6px', padding: '10px 14px', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: '#92400E', lineHeight: 1.6 }}>
            ⚠ Advance of <strong>{advance}%</strong> exceeds the 30% guideline. You may still submit, but expect
            additional scrutiny from the approver.
          </div>
        </div>
      )}

      {requiresFLEmail && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px 14px', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: '#B91C1C', lineHeight: 1.6, marginBottom: '10px' }}>
            <strong>100% advance</strong> requires explicit <strong>Functional Leader approval over email</strong>{' '}
            before this PR can proceed. FL will still action the approval in-app.
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#7F1D1D' }}>
            <input
              type="checkbox"
              checked={!!value.flEmailAck}
              onChange={e => set({ flEmailAck: e.target.checked })}
              style={{ width: '15px', height: '15px', marginTop: '1px' }}
            />
            I confirm Functional Leader email approval has been / will be obtained for this 100% advance.
          </label>

          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #FECACA' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#7F1D1D', marginBottom: '8px' }}>
              Attach screenshot of FL approval email<span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>
            </div>
            <QuoteUpload skipExtraction onFileUploaded={path => set({ screenshotPath: path })} />
            <div style={{ fontSize: '11px', color: value.screenshotPath ? '#15803D' : '#B91C1C', marginTop: '6px' }}>
              {value.screenshotPath ? '✓ Screenshot uploaded' : 'Screenshot not uploaded'}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '8px' }}>{error}</div>
      )}
    </div>
  )
}
