import { useEffect, useState } from 'react'
import { blockNonNumericKey, sanitizeNumericPaste, sanitizeNumericValue } from '../../lib/numericInput'

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
        <div style={{ fontSize: '13px', color: '#4A4A4A' }}>Verifying documents</div>
        <div className="spinner" />
      </div>
    )
  }

  if (phase === 'match') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '8px' }}>
        <div style={{ fontSize: '15px', color: '#16A34A' }}>Documents match</div>
        <div style={{ fontSize: '40px', fontWeight: 500, color: '#1A1A1A' }}>
          {receiptAmount?.toLocaleString('en-IN')}
        </div>
        <div style={{ fontSize: '13px', color: '#6B6B6B' }}>rupees</div>
      </div>
    )
  }

  if (phase === 'mismatch') {
    return (
      <div>
        <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '6px' }}>Amount mismatch</div>
        <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '20px' }}>
          Your receipt shows {receiptAmount} but your payment proof shows {paymentAmount}. Please check your documents.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onRetakeReceipt}
            style={{
              width: '100%', height: '44px', border: '1px solid #E8E8E8', background: '#FFFFFF',
              color: '#1A1A1A', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Retake receipt
          </button>
          <button
            onClick={onRetakePayment}
            style={{
              width: '100%', height: '44px', background: '#8C3225', color: '#FFFFFF',
              border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Retake payment proof
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'unreadable') {
    return (
      <div>
        <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '20px' }}>
          Could not read the amount from one of your documents.
        </div>
        {showManualInput && (
          <div style={{ marginBottom: '12px' }}>
            <input
              type="number"
              placeholder="Enter amount"
              value={manualAmount}
              onChange={(e) => setManualAmount(sanitizeNumericValue(e.target.value))}
              onKeyDown={blockNonNumericKey}
              onPaste={sanitizeNumericPaste}
              style={{
                width: '100%', height: '44px', border: '1px solid #E8E8E8',
                fontSize: '14px', padding: '0 12px', borderRadius: '4px', outline: 'none',
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onRetakeReceipt}
            style={{
              width: '100%', height: '44px', border: '1px solid #E8E8E8', background: '#FFFFFF',
              color: '#1A1A1A', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Retake receipt
          </button>
          <button
            onClick={onRetakePayment}
            style={{
              width: '100%', height: '44px', border: '1px solid #E8E8E8', background: '#FFFFFF',
              color: '#1A1A1A', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Retake payment proof
          </button>
          {!showManualInput && (
            <button
              onClick={() => setShowManualInput(true)}
              style={{
                width: '100%', height: '44px', background: '#8C3225', color: '#FFFFFF',
                border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
              }}
            >
              Enter amount manually
            </button>
          )}
          {showManualInput && (
            <button
              onClick={() => onConfirm({ matchedAmount: parseFloat(manualAmount) || null, amountsMatch: false })}
              style={{
                width: '100%', height: '44px', background: '#8C3225', color: '#FFFFFF',
                border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
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
