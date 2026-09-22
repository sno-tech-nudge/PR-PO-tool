// Called by Nucleus after a document finishes uploading (via the signed
// URL from api/intake/upload-url.js) — runs the exact same OCR
// auto-extraction VendorForm.jsx/QuoteRows.jsx run client-side, just
// server-side here since the Gemini API key only lives in this tool's env.
// Downloads the just-uploaded file from Storage (rather than asking Nucleus
// to send image bytes a second time) and reuses src/lib/claude.js's
// extractors directly — gemini.js was made Node-safe for exactly this.
import { supabaseAdmin, requireIntakeAuth } from '../_lib/supabaseAdmin.js'
import {
  extractChequeDetails,
  extractPanCardDetails,
  extractGstCertDetails,
  extractMsmeCertDetails,
  extractVendorQuote,
} from '../../src/lib/claude.js'

const EXTRACTORS = {
  cheque: extractChequeDetails,
  pan: extractPanCardDetails,
  gst: extractGstCertDetails,
  msme: extractMsmeCertDetails,
  quote: extractVendorQuote,
}

// Every extractor in claude.js was built for a base64 JPEG the browser had
// already normalized to (imageFileToJpegBase64) — there's no PDF-to-image
// conversion available in this Node runtime, so a PDF upload just skips
// extraction gracefully (same "OCR is convenience-only, never blocking"
// contract every other caller of these extractors already relies on).
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireIntakeAuth(req, res)) return

  const { type, bucket, storage_path } = req.body || {}
  const extractor = EXTRACTORS[type]
  if (!extractor || !bucket || !storage_path) {
    res.status(400).json({ error: `type must be one of ${Object.keys(EXTRACTORS).join(', ')}, and bucket/storage_path are required` })
    return
  }
  if (!IMAGE_EXT.test(storage_path)) {
    res.status(200).json({ ok: false, reason: 'unsupported_file_type' })
    return
  }

  try {
    const { data: blob, error: downloadError } = await supabaseAdmin.storage.from(bucket).download(storage_path)
    if (downloadError) throw downloadError

    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
    const result = await extractor(base64)

    res.status(200).json({ ok: !!result, data: result })
  } catch (err) {
    console.error('intake/extract failed:', err)
    // Same non-blocking contract as every client-side OCR call in this app —
    // a failure here should never surface as an error Nucleus has to handle,
    // just an empty result the form falls back to manual entry for.
    res.status(200).json({ ok: false, reason: 'extraction_failed' })
  }
}
