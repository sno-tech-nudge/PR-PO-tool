import { useRef, useState } from 'react'
import { checkDocumentQuality, detectUPI, extractPaymentAmount } from '../../lib/claude'
import QualityCheck from './QualityCheck'

async function imageFileToJpegBase64(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      resolve({ base64: dataUrl.split(',')[1], previewUrl: dataUrl })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}

async function pdfPageToBase64(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2.0 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  return { base64: dataUrl.split(',')[1], previewUrl: dataUrl }
}

const PAYMENT_TYPES = [
  { id: 'upi', label: 'UPI Screenshot', sublabel: 'GPay, PhonePe, Paytm' },
  { id: 'bank_sms', label: 'Bank SMS', sublabel: 'Transaction alert' },
  { id: 'card', label: 'Card Payment', sublabel: 'Debit or credit card SMS' },
  { id: 'cash', label: 'Cash', sublabel: 'Under 500 only' },
]

export default function Step2Payment({ receiptExtracted, onComplete, onBack }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const [selectedType, setSelectedType] = useState(null)
  const [cashAmountError, setCashAmountError] = useState(false)
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [base64, setBase64] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [qualityIssue, setQualityIssue] = useState(null)
  const [error, setError] = useState(null)
  const [cashAmount, setCashAmount] = useState(receiptExtracted?.amount ?? '')
  const [cashVendor, setCashVendor] = useState(receiptExtracted?.vendor ?? '')
  const [cashDate, setCashDate] = useState(receiptExtracted?.date ?? new Date().toLocaleDateString('en-IN'))

  function handleTypeSelect(typeId) {
    if (typeId === 'cash') {
      const amt = parseFloat(receiptExtracted?.amount)
      if (!isNaN(amt) && amt > 500) {
        setCashAmountError(true)
        return
      }
    }
    setCashAmountError(false)
    setSelectedType(typeId)
    setPreview(null)
    setFile(null)
    setBase64(null)
    setError(null)
  }

  async function handleFileSelect(e) {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (selected.size > 10 * 1024 * 1024) {
      setError('This file is too large. Please use an image under 10MB.')
      return
    }
    setError(null)
    setFile(selected)

    if (selected.type === 'application/pdf') {
      setLoading(true)
      setLoadingText('Converting PDF to image')
      try {
        const { base64: b64, previewUrl } = await pdfPageToBase64(selected)
        setBase64(b64)
        setPreview(previewUrl)
      } catch {
        setError('Could not read this PDF. Try uploading an image instead.')
      }
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadingText('Preparing image')
    try {
      const { base64: b64, previewUrl } = await imageFileToJpegBase64(selected)
      setBase64(b64)
      setPreview(previewUrl)
    } catch {
      setError('Could not read this image. Try a different file.')
    }
    setLoading(false)
  }

  function handleRetake() {
    setPreview(null)
    setFile(null)
    setBase64(null)
    setQualityIssue(null)
    setError(null)
  }

  async function runQualityAndUPI(b64, overrideQuality) {
    setLoading(true)
    setLoadingText('Checking document quality')
    if (!overrideQuality) {
      const quality = await checkDocumentQuality(b64)
      if (quality && quality.readable === false) {
        setLoading(false)
        setQualityIssue(quality.issue)
        return
      }
    }
    setLoadingText('Reading payment details')
    const [upiData, paymentExtracted] = await Promise.all([
      detectUPI(b64),
      extractPaymentAmount(b64),
    ])
    setLoading(false)
    onComplete({
      file, base64: b64, preview,
      paymentType: selectedType,
      upiData: upiData || null,
      paymentExtracted: paymentExtracted || null,
      qualityOverride: overrideQuality,
    })
  }

  async function handleUsePhoto() {
    if (!base64) return
    await runQualityAndUPI(base64, false)
  }

  function handleQualityRetake() {
    setQualityIssue(null)
    handleRetake()
  }

  async function handleUseAnyway() {
    setQualityIssue(null)
    await runQualityAndUPI(base64, true)
  }

  function handleCashConfirm() {
    onComplete({
      file: null, base64: null, preview: null,
      paymentType: 'cash',
      upiData: null,
      qualityOverride: false,
      cashDetails: { amount: cashAmount, vendor: cashVendor, date: cashDate },
    })
  }

  const showCapture = selectedType && selectedType !== 'cash'
  const showCash = selectedType === 'cash'

  return (
    <div>
      <button
        onClick={onBack}
        style={{ fontSize: '13px', color: '#4A4A4A', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px', padding: 0 }}
      >
        Back
      </button>
      <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '16px' }}>Step 2 of 2</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '6px' }}>
        Add proof of payment
      </div>
      <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '20px' }}>
        UPI screenshot, bank SMS, card SMS, or cash declaration
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        {PAYMENT_TYPES.map((type) => (
          <div
            key={type.id}
            onClick={() => handleTypeSelect(type.id)}
            style={{
              border: selectedType === type.id ? '1px solid #1A1A1A' : '1px solid #E8E8E8',
              background: selectedType === type.id ? '#F7F7F7' : '#FFFFFF',
              padding: '16px',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A' }}>{type.label}</div>
            <div style={{ fontSize: '11px', color: '#6B6B6B' }}>{type.sublabel}</div>
          </div>
        ))}
      </div>

      {cashAmountError && (
        <div style={{ fontSize: '13px', color: '#DC2626', marginBottom: '12px' }}>
          Cash declaration is only available for amounts under 500 rupees
        </div>
      )}

      {showCapture && !preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          <button
            onClick={() => cameraRef.current?.click()}
            style={{
              width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
              border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Take photo
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            style={{
              width: '100%', height: '48px', background: '#FFFFFF', color: '#1A1A1A',
              border: '1px solid #8C3225', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Upload from gallery or files
          </button>
          <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" style={{ display: 'none' }} onChange={handleFileSelect} />
          <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>
      )}

      {error && <div style={{ fontSize: '13px', color: '#DC2626', marginTop: '12px' }}>{error}</div>}

      {showCapture && preview && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ background: '#F7F7F7', marginBottom: '12px', position: 'relative' }}>
            <img src={preview} alt="Payment proof preview" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block' }} />
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px',
              }}>
                <div style={{ fontSize: '13px', color: '#4A4A4A' }}>{loadingText}</div>
                <div className="spinner" />
              </div>
            )}
          </div>
          {!loading && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleRetake}
                style={{
                  width: '48%', height: '44px', border: '1px solid #E8E8E8', background: '#FFFFFF',
                  color: '#1A1A1A', fontSize: '13px', cursor: 'pointer', borderRadius: '4px',
                }}
              >
                Retake
              </button>
              <button
                onClick={handleUsePhoto}
                style={{
                  width: '48%', height: '44px', background: '#8C3225', color: '#FFFFFF',
                  border: 'none', fontSize: '13px', cursor: 'pointer', borderRadius: '4px',
                }}
              >
                Use this photo
              </button>
            </div>
          )}
        </div>
      )}

      {showCash && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '12px', lineHeight: '1.6' }}>
            I confirm I paid{' '}
            <input
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              style={{ border: 'none', borderBottom: '1px solid #1A1A1A', fontSize: '13px', width: '80px', textAlign: 'center', outline: 'none' }}
              placeholder="amount"
            />{' '}
            in cash to{' '}
            <input
              value={cashVendor}
              onChange={(e) => setCashVendor(e.target.value)}
              style={{ border: 'none', borderBottom: '1px solid #1A1A1A', fontSize: '13px', width: '120px', textAlign: 'center', outline: 'none' }}
              placeholder="vendor"
            />{' '}
            on{' '}
            <input
              value={cashDate}
              onChange={(e) => setCashDate(e.target.value)}
              style={{ border: 'none', borderBottom: '1px solid #1A1A1A', fontSize: '13px', width: '100px', textAlign: 'center', outline: 'none' }}
              placeholder="date"
            />
          </div>
          <button
            onClick={handleCashConfirm}
            style={{
              width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
              border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
            }}
          >
            Confirm declaration
          </button>
        </div>
      )}

      {qualityIssue && (
        <QualityCheck issue={qualityIssue} onRetake={handleQualityRetake} onUseAnyway={handleUseAnyway} />
      )}
    </div>
  )
}
