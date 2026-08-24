// Vision models read a ~1800px image just as accurately as a 4000px phone
// photo, but the bigger payload costs real seconds in base64 encoding +
// upload + model processing — capping dimensions here is what actually makes
// OCR feel fast, not just prompt tuning.
const MAX_DIMENSION = 1800

// Converts any image file (PNG, HEIC, WebP, JPEG…) to a JPEG base64 via canvas
// so Groq/Gemini always receives a clean JPEG regardless of source format,
// downscaled so the OCR round trip doesn't stall on an oversized upload.
export async function imageFileToJpegBase64(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      resolve({ base64: dataUrl.split(',')[1], previewUrl: dataUrl })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
}

export async function pdfPageToBase64(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(2.0, MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height))
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  return { base64: dataUrl.split(',')[1], previewUrl: dataUrl }
}
