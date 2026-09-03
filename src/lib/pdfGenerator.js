export async function generateExpenseReportPDF() {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default

  const element = document.getElementById('pdf-template')
  if (!element) return null

  try {
    const canvas = await html2canvas(element, {
      scale: 1.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 3000,
      onclone: (clonedDoc) => {
        const clonedElement = clonedDoc.getElementById('pdf-template')
        if (clonedElement) {
          clonedElement.style.display = 'block'
          clonedElement.style.position = 'relative'
          clonedElement.style.left = '0'
        }
      },
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4',
      compress: true,
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    const imgData = canvas.toDataURL('image/jpeg', 0.85)

    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    return pdf
  } catch (error) {
    console.log('PDF generation failed:', error.message)
    return null
  }
}

async function renderElementCanvas(html2canvas, elementId) {
  const element = document.getElementById(elementId)
  if (!element) return null
  return html2canvas(element, {
    scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
    onclone: (clonedDoc) => {
      const el = clonedDoc.getElementById(elementId)
      if (el) { el.style.display = 'block'; el.style.position = 'relative'; el.style.left = '0' }
    },
  })
}

// Drops one canvas onto exactly one new PDF page, no slicing — used for the
// PO terms pages, each of which is already pre-sized in POTemplate.jsx to
// fit a single page exactly.
function addFullPageCanvas(pdf, canvas) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgData = canvas.toDataURL('image/jpeg', 0.85)
  pdf.addPage()
  pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight)
}

// Slices one canvas across as many PDF pages as its height needs.
// `startNewPage`: false for the very first page added to a fresh PDF,
// true when this canvas's content must begin on its own new page (e.g. the
// terms & conditions block should never share a page with the PO cover).
function addCanvasPages(pdf, canvas, startNewPage) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const imgData = canvas.toDataURL('image/jpeg', 0.85)
  let heightLeft = imgHeight, position = 0
  if (startNewPage) pdf.addPage()
  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight
  while (heightLeft >= 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }
}

// PO PDFs are independently-rendered DOM blocks (see POTemplate.jsx):
// #po-template-cover (PO details, page 1), then one #po-template-terms-N div
// per page of Appendix A — POTemplate.jsx pre-paginates the terms by
// measuring real clause heights, so each of those divs is already exactly
// one page's worth of content with its own margins; each gets screenshotted
// and dropped onto its own PDF page with no further slicing.
export async function generatePOPDF() {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default
  try {
    const coverCanvas = await renderElementCanvas(html2canvas, 'po-template-cover')
    if (!coverCanvas) return null
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4', compress: true })
    addCanvasPages(pdf, coverCanvas, false)

    for (let i = 0; document.getElementById(`po-template-terms-${i}`); i++) {
      const pageCanvas = await renderElementCanvas(html2canvas, `po-template-terms-${i}`)
      if (pageCanvas) addFullPageCanvas(pdf, pageCanvas)
    }

    return pdf
  } catch (error) {
    console.log('PO PDF generation failed:', error.message)
    return null
  }
}

export function downloadPDF(pdf, filename) {
  if (!pdf) return
  pdf.save(filename)
}

export async function uploadPDFToSupabase(pdf, filename, supabaseClient, bucket = 'expense-reports', { upsert = false } = {}) {
  if (!pdf) return null

  try {
    const pdfBlob = pdf.output('blob')

    const { data, error } = await supabaseClient
      .storage
      .from(bucket)
      .upload(filename, pdfBlob, {
        contentType: 'application/pdf',
        upsert,
      })

    if (error) {
      console.log('Upload failed:', error.message)
      return null
    }

    return data.path
  } catch (error) {
    console.log('Upload error:', error.message)
    return null
  }
}
