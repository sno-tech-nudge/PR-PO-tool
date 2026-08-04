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

export async function generatePOPDF() {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default
  const element = document.getElementById('po-template')
  if (!element) return null
  try {
    const canvas = await html2canvas(element, {
      scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
      onclone: (clonedDoc) => {
        const el = clonedDoc.getElementById('po-template')
        if (el) { el.style.display = 'block'; el.style.position = 'relative'; el.style.left = '0' }
      },
    })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4', compress: true })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const imgData = canvas.toDataURL('image/jpeg', 0.85)
    let heightLeft = imgHeight, position = 0
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight; pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
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

export async function uploadPDFToSupabase(pdf, filename, supabaseClient) {
  if (!pdf) return null

  try {
    const pdfBlob = pdf.output('blob')

    const { data, error } = await supabaseClient
      .storage
      .from('expense-reports')
      .upload(filename, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false,
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
