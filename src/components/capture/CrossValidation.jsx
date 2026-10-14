import { useEffect, useState } from 'react'
import AmountInput from '../shared/AmountInput'

export default function CrossValidation({ receiptExtracted, paymentData, onConfirm, onRetakeReceipt, onRetakePayment }) {
  const [phase, setPhase] = useState('loading')
  const [manualAmount, setManualAmount] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)

  const receiptAmount = receiptExtracted?.amount != null ? parseFloat(receiptExtracted.amount) : null
  const rawPaymentAmount = paymentData?.paymentExtracted?.amount ?? paymentData?.upiData?.amount ?? null
  const paymentAmount = rawPaymentAmount != null ? parseFloat(rawPaymentAmount) : null

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('Cross validation amounts — receipt:', receiptAmount, 'payment:', paymentAmount)
      if (receiptAmount !== null && !isNaN(receiptAmount) && paymentAmount !== null && !isNaN(paymentAmount)) {
        const diff = Math.abs(receiptAmount - paymentAmount)
        if (diff <= 10) {
          setPhase('match')
          setTimeout(() => onConfirm({ matchedAmount: receiptAmount, amountsMatch: true }), 1500)
        } else {
          setPhase('mismatch')
        }
      } else {
        setPhase('unreadable')
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [])

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Verifying documents</div>
        <div className="spinner" />
      </div>
    )
  }

  if (phase === 'match') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '8px' }}>
        <div style={{ fontSize: '15px', color: 'var(--moss)' }}>Documents match</div>
        <div style={{ fontSize: '40px', fontWeight: 500, color: 'var(--text)' }}>
          {receiptAmount?.toLocaleString('en-IN')}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>rupees</div>
      </div>
    )
  }

  if (phase === 'mismatch') {
    const lower = Math.min(receiptAmount, paymentAmount)
    const higher = Math.max(receiptAmount, paymentAmount)
    const lowerSource = receiptAmount <= paymentAmount ? 'receipt' : 'payment proof'
    const fmt = n => `₹${Number(n).toLocaleString('en-IN')}`
    return (
      <div>
        <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)', marginBottom: '6px' }}>The amounts differ</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', lineHeight: 1.5 }}>
          Your receipt shows {fmt(receiptAmount)} and your payment proof shows {fmt(paymentAmount)}.
          We will use the lower one, {fmt(lower)} (from the {lowerSource}), since that is what you actually paid.
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Paying a vendor? A difference can be tax deducted at source. Accounts will check it.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => onConfirm({ matchedAmount: lower, amountsMatch: false, amountChoice: 'lower' })}
            style={{
              width: '100%', height: '44px', background: 'var(--action)', color: 'var(--surface-card)',
              border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Use {fmt(lower)}
          </button>
          <button
            onClick={() => onConfirm({ matchedAmount: higher, amountsMatch: false, amountChoice: 'higher' })}
            style={{
              width: '100%', height: '44px', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)',
              color: 'var(--text)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Use {fmt(higher)} instead
          </button>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '4px' }}>
            <span role="button" onClick={onRetakeReceipt} style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Retake receipt</span>
            <span role="button" onClick={onRetakePayment} style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>Retake payment proof</span>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'unreadable') {
    return (
      <div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Could not read the amount from one of your documents.
        </div>
        {showManualInput && (
          <div style={{ marginBottom: '12px' }}>
            <AmountInput
              placeholder="Enter amount"
              value={manualAmount}
              onChange={setManualAmount}
              inputStyle={{ height: '44px', fontSize: '14px' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onRetakeReceipt}
            style={{
              width: '100%', height: '44px', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)',
              color: 'var(--text)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Retake receipt
          </button>
          <button
            onClick={onRetakePayment}
            style={{
              width: '100%', height: '44px', border: '1px solid var(--taupe-200)', background: 'var(--surface-card)',
              color: 'var(--text)', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}
          >
            Retake payment proof
          </button>
          {!showManualInput && (
            <button
              onClick={() => setShowManualInput(true)}
              style={{
                width: '100%', height: '44px', background: 'var(--action)', color: 'var(--surface-card)',
                border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              }}
            >
              Enter amount manually
            </button>
          )}
          {showManualInput && (
            <button
              onClick={() => onConfirm({ matchedAmount: parseFloat(manualAmount) || null, amountsMatch: false })}
              style={{
                width: '100%', height: '44px', background: 'var(--action)', color: 'var(--surface-card)',
                border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              }}
            >
              Confirm amount
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
