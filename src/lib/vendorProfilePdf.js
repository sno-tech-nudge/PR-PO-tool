// Builds a single PDF: the vendor overview (rendered from the off-screen
// VendorPdfTemplate) followed by one page per attached document.
//
// Uses pdf-lib rather than pdfjs-dist for the attachments: pdf-lib merges
// existing PDF pages byte-for-byte on the main thread, with no rendering
// worker involved at all — pdfjs-dist's worker (the technique used
// elsewhere in this app for reading an uploaded PDF page, e.g.
// receiptImage.js) hung indefinitely here in both dev and production
// builds, apparently a main-thread/worker version mismatch from this
// project's bundling. pdf-lib sidesteps that entirely.

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Normalizes any image blob to JPEG bytes via canvas — same technique as
// imageFileToJpegBase64 in receiptImage.js — so pdf-lib's embedJpg always
// gets a format it understands regardless of the source (PNG, WebP, etc).
async function imageBlobToJpegBytes(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')) }
    img.src = url
  })
  return dataUrlToBytes(dataUrl)
}

function drawFitted(page, image, label, font) {
  const marginTop = label ? 44 : 20
  const availW = A4_WIDTH - 40
  const availH = A4_HEIGHT - marginTop - 20
  const scale = Math.min(availW / image.width, availH / image.height, 1)
  const w = image.width * scale
  const h = image.height * scale
  if (label) {
    page.drawText(label, { x: 20, y: A4_HEIGHT - 28, size: 11, font })
  }
  page.drawImage(image, { x: (A4_WIDTH - w) / 2, y: A4_HEIGHT - marginTop - h, width: w, height: h })
}

// documents: [{ label, url, path }] — url is a signed Supabase Storage URL,
// path is the storage path (used only as an extension fallback if the
// fetched blob's content-type is missing/generic).
export async function generateVendorProfilePDF({ documents = [], onProgress } = {}) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const html2canvas = (await import('html2canvas')).default

  const element = document.getElementById('vendor-pdf-template')
  if (!element) return null

  onProgress?.('Rendering overview…')
  const canvas = await html2canvas(element, {
    scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
    onclone: (clonedDoc) => {
      const el = clonedDoc.getElementById('vendor-pdf-template')
      if (el) { el.style.display = 'block'; el.style.position = 'relative'; el.style.left = '0' }
    },
  })

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const overviewBytes = dataUrlToBytes(canvas.toDataURL('image/png'))
  const overviewImg = await pdfDoc.embedPng(overviewBytes)
  drawFitted(pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]), overviewImg, null, font)

  for (const doc of documents) {
    onProgress?.(`Adding ${doc.label}…`)
    try {
      const res = await fetch(doc.url)
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
      const blob = await res.blob()
      const isPdf = blob.type === 'application/pdf' || /\.pdf(\?|$)/i.test(doc.path || '')

      if (isPdf) {
        const srcDoc = await PDFDocument.load(await blob.arrayBuffer())
        const copiedPages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices())
        copiedPages.forEach((page, idx) => {
          pdfDoc.addPage(page)
          const label = copiedPages.length > 1 ? `${doc.label} (page ${idx + 1}/${copiedPages.length})` : doc.label
          page.drawText(label, { x: 16, y: page.getHeight() - 20, size: 9, font })
        })
      } else {
        const jpegBytes = await imageBlobToJpegBytes(blob)
        const img = await pdfDoc.embedJpg(jpegBytes)
        drawFitted(pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]), img, doc.label, font)
      }
    } catch (err) {
      console.error(`Could not embed document "${doc.label}":`, err)
      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
      page.drawText(`${doc.label} — could not be loaded for this PDF`, { x: 20, y: A4_HEIGHT - 28, size: 11, font })
    }
  }

  const bytes = await pdfDoc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export function downloadVendorProfilePDF(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
