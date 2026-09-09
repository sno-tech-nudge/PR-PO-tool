// Builds a single PDF: the vendor overview (rendered from the off-screen
// VendorPdfTemplate) followed by one page per attached document (the
// document-merging part is shared with any other feature that needs to
// combine uploaded files into one PDF — see src/lib/pdfMerge.js).

import { appendDocumentsToPdf, downloadPDF } from './pdfMerge'

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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

  await appendDocumentsToPdf(pdfDoc, font, documents, onProgress)

  const bytes = await pdfDoc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export function downloadVendorProfilePDF(blob, filename) {
  downloadPDF(blob, filename)
}
