import { useNetworkStatus } from '../../hooks/useNetworkStatus'

const PAYMENT_LABELS = {
  upi: 'UPI',
  bank_sms: 'Bank SMS',
  card: 'Card Payment',
  cash: 'Cash',
}

export default function ConfirmationScreen({ receiptExtracted, paymentData, matchedAmount, singleDocument, capturedOffline, onContinue }) {
  const { isOnline } = useNetworkStatus()
  const isOffline = capturedOffline || !isOnline

  const amount = matchedAmount ?? receiptExtracted?.amount ?? null
  const vendor = receiptExtracted?.vendor ?? null
  const date = receiptExtracted?.date ?? new Date().toLocaleDateString('en-IN')
  const paymentMethod = paymentData?.paymentType ? PAYMENT_LABELS[paymentData.paymentType] || paymentData.paymentType : 'Unknown'
  const docLabel = singleDocument ? 'Single UPI document' : 'Receipt + Payment proof'
  const statusText = isOffline ? 'Saved offline' : 'Ready to submit'
  const statusColor = isOffline ? '#CA8A04' : '#16A34A'

  const rows = [
    { label: 'Amount', value: amount ? `${amount.toLocaleString('en-IN')} rupees` : 'Not detected' },
    { label: 'Vendor', value: vendor || 'Not detected' },
    { label: 'Date', value: date },
    { label: 'Payment method', value: paymentMethod },
    { label: 'Documents', value: docLabel },
    { label: 'Status', value: statusText, color: statusColor },
  ]

  return (
    <div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '20px' }}>
        Documents saved
      </div>

      <div style={{ border: '1px solid #E8E8E8', padding: '20px', borderRadius: '4px', marginBottom: '16px' }}>
        {rows.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: i > 0 ? '12px' : 0,
              marginTop: i > 0 ? '12px' : 0,
              borderTop: i > 0 ? '1px solid #F7F7F7' : 'none',
            }}
          >
            <span style={{ fontSize: '12px', color: '#6B6B6B' }}>{row.label}</span>
            <span style={{ fontSize: '13px', fontWeight: 500, color: row.color || '#1A1A1A' }}>{row.value}</span>
          </div>
        ))}
      </div>

      {isOffline && (
        <div style={{
          border: '1px solid #CA8A04',
          background: '#FEFCE8',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '13px',
          color: '#CA8A04',
          marginBottom: '16px',
        }}>
          Saved to your device. Will sync when you reconnect.
        </div>
      )}

      <button
        onClick={() => onContinue && onContinue({
          amount: matchedAmount ?? receiptExtracted?.amount ?? null,
          vendor: receiptExtracted?.vendor ?? null,
          date: receiptExtracted?.date ?? null,
          category: receiptExtracted?.category ?? null,
          invoice_number: receiptExtracted?.invoice_number ?? null,
          gstin: receiptExtracted?.gstin ?? null,
          payment_method: paymentData?.paymentType ?? null,
          is_upi: paymentData?.upiData?.is_upi ?? false,
          single_document: singleDocument ?? false,
        })}
        style={{
          width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
          border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
        }}
      >
        Continue to expense details
      </button>
    </div>
  )
}
