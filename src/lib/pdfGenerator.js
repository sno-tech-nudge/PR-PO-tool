// html2canvas's backgroundColor option needs an actual resolved color — it
// throws ("unsupported color function \"var\"") if handed a raw var(...)
// reference, which every PDF export in this app (expense report, PO, vendor
// profile) was doing. This was a hard, 100%-reproducing failure, not a rare
// edge case: every single html2canvas call using this option has been
// failing before jsPDF ever runs, silently leaving pdf_storage_path/the
// download null wherever the failure is caught non-blocking. Resolving via
// getComputedStyle instead of hardcoding a literal keeps this correct if the
// token's value ever changes.
function resolveCssVar(name, fallback = '#FFFFFF') {
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return resolved || fallback
}

// The backgroundColor option above is only half of this bug. This app's
// design tokens (moss/gold/clay status colors, --action-bg, --border,
// --rule, --focus-ring, and others — see src/styles/tokens.css) are defined
// with color-mix(), which every browser resolves down through
// getComputedStyle not to legacy rgb()/rgba() but to the CSS Color Level 4
// `color(srgb r g b [/ a])` function — a syntax html2canvas 1.4.1 (this
// project's version, released before browsers commonly emitted this format)
// cannot parse either, throwing the exact same "unsupported color function"
// error for any element anywhere in the screenshotted subtree that uses one
// of these tokens for color/background/border. A PO/report/vendor-profile
// template that includes so much as one status badge or themed border hits
// this on every single render — this was the real, always-reproducing root
// cause behind "the PDF doesn't appear", not a rare edge case.
//
// Fix: before html2canvas rasterizes the clone, walk it in lockstep with the
// live source subtree (same structure, so same traversal order) and convert
// each element's *computed* color-ish properties from `color(srgb ...)` to
// a literal rgb()/rgba() html2canvas can actually parse, inlined directly on
// the clone so it wins over the stylesheet rule.
const COLOR_PROPS = [
  'color', 'backgroundColor',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'textDecorationColor',
]
function legacyColor(value) {
  const m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/.exec(value)
  if (!m) return null
  const [, r, g, b, a] = m
  const R = Math.round(parseFloat(r) * 255)
  const G = Math.round(parseFloat(g) * 255)
  const B = Math.round(parseFloat(b) * 255)
  return a != null ? `rgba(${R}, ${G}, ${B}, ${a})` : `rgb(${R}, ${G}, ${B})`
}
export function inlineUnsupportedColors(sourceRoot, cloneRoot) {
  const sourceEls = [sourceRoot, ...sourceRoot.querySelectorAll('*')]
  const cloneEls = [cloneRoot, ...cloneRoot.querySelectorAll('*')]
  for (let i = 0; i < sourceEls.length; i++) {
    const src = sourceEls[i]
    const dst = cloneEls[i]
    if (!src || !dst) continue
    const computed = getComputedStyle(src)
    for (const prop of COLOR_PROPS) {
      const legacy = legacyColor(computed[prop])
      if (legacy) dst.style[prop] = legacy
    }
  }
}

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
      backgroundColor: resolveCssVar('--surface-card'),
      logging: false,
      imageTimeout: 3000,
      onclone: (clonedDoc) => {
        const clonedElement = clonedDoc.getElementById('pdf-template')
        if (clonedElement) {
          clonedElement.style.display = 'block'
          clonedElement.style.position = 'relative'
          clonedElement.style.left = '0'
          inlineUnsupportedColors(element, clonedElement)
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
    scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: resolveCssVar('--surface-card'), logging: false,
    onclone: (clonedDoc) => {
      const el = clonedDoc.getElementById(elementId)
      if (el) {
        el.style.display = 'block'; el.style.position = 'relative'; el.style.left = '0'
        inlineUnsupportedColors(element, el)
      }
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
