import { appendDocumentsToPdf } from './pdfMerge'

// Merges every document attached to one expense (receipt image, payment
// proof, and any supporting_attachments) into a single downloadable PDF —
// no off-screen "overview" page like vendorProfilePdf.js's vendor-specific
// one, just the documents themselves.
export async function generateExpenseAttachmentsPDF({ documents = [], onProgress } = {}) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  await appendDocumentsToPdf(pdfDoc, font, documents, onProgress)
  return new Blob([await pdfDoc.save()], { type: 'application/pdf' })
}

export { downloadPDF } from './pdfMerge'
