// Shared pdf-lib merge logic — pulled out of vendorProfilePdf.js so any
// feature that needs to combine a set of already-uploaded documents
// (images and/or existing PDFs) into one downloadable PDF can reuse it,
// without every caller re-implementing the same fetch/normalize/embed loop.
//
// Uses pdf-lib rather than pdfjs-dist: pdf-lib merges existing PDF pages
// byte-for-byte on the main thread, with no rendering worker involved at
// all — pdfjs-dist's worker (the technique used elsewhere in this app for
// reading an uploaded PDF page, e.g. receiptImage.js) hung indefinitely
// here in both dev and production builds, apparently a main-thread/worker
// version mismatch from this project's bundling. pdf-lib sidesteps that
// entirely.

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
// fetched blob's content-type is missing/generic). Appends one page per
// image (fitted/centered on A4) or every page of an existing PDF (copied
// byte-for-byte, each labeled "{label} (page n/total)" when multi-page).
// A document that fails to fetch/embed gets a placeholder page instead of
// aborting the whole merge — one bad attachment shouldn't cost every
// other one.
export async function appendDocumentsToPdf(pdfDoc, font, documents, onProgress) {
  const { PDFDocument } = await import('pdf-lib')
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
}

export function downloadPDF(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
