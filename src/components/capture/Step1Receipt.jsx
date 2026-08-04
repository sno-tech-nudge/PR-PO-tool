import { useRef, useState } from 'react'
import { checkDocumentQuality, extractReceiptData } from '../../lib/claude'
import QualityCheck from './QualityCheck'

// Converts any image file (PNG, HEIC, WebP, JPEG…) to a JPEG base64 via canvas
// so Groq always receives a clean JPEG regardless of source format
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
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()

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

export default function Step1Receipt({ onComplete }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [base64, setBase64] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [qualityIssue, setQualityIssue] = useState(null)
  const [error, setError] = useState(null)

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
        setError('Could not read this PDF. Try uploading a clearer image instead.')
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

  async function handleUsePhoto() {
    if (!base64) return
    setLoading(true)
    setLoadingText('Checking document quality')
    const quality = await checkDocumentQuality(base64)
    if (quality && quality.readable === false) {
      setLoading(false)
      setQualityIssue(quality.issue)
      return
    }
    setLoadingText('Reading document')
    const extracted = await extractReceiptData(base64)
    setLoading(false)
    onComplete({ file, base64, preview, extracted: extracted || {}, qualityOverride: false })
  }

  function handleQualityRetake() {
    setQualityIssue(null)
    handleRetake()
  }

  async function handleUseAnyway() {
    setQualityIssue(null)
    setLoading(true)
    setLoadingText('Reading document')
    const extracted = await extractReceiptData(base64)
    setLoading(false)
    onComplete({ file, base64, preview, extracted: extracted || {}, qualityOverride: true })
  }

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#6B6B6B', marginBottom: '4px' }}>New Expense</div>
      <div style={{ fontSize: '12px', color: '#6B6B6B', marginBottom: '16px' }}>Step 1 of 2</div>
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '6px' }}>
        Add your receipt
      </div>
      <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '20px' }}>
        Paper receipt, screenshot, or PDF from an online purchase
      </div>

      {!preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

      {error && (
        <div style={{ fontSize: '13px', color: '#DC2626', marginTop: '12px' }}>{error}</div>
      )}

      {preview && (
        <div>
          <div style={{ background: '#F7F7F7', marginBottom: '12px', position: 'relative' }}>
            <img src={preview} alt="Receipt preview" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block' }} />
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

      {qualityIssue && (
        <QualityCheck issue={qualityIssue} onRetake={handleQualityRetake} onUseAnyway={handleUseAnyway} />
      )}
    </div>
  )
}
