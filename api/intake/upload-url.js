// Called by Nucleus's "intake-proxy" edge function (op: "upload_url") before
// a Vendor Registration / Purchase Request submission — hands back a
// short-lived signed URL the Nucleus browser then PUTs the raw file bytes
// to directly, so attachments never transit this endpoint's own request
// body (Vercel's ~4.5MB default limit would be too small for a multi-file
// vendor submission) or Nucleus's edge function.
import { supabaseAdmin, requireIntakeAuth } from '../_lib/supabaseAdmin.js'

const ALLOWED_BUCKETS = ['vendor-documents', 'pr-quotes']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireIntakeAuth(req, res)) return

  const { bucket, file_name } = req.body || {}
  if (!ALLOWED_BUCKETS.includes(bucket) || !file_name) {
    res.status(400).json({ error: `bucket must be one of ${ALLOWED_BUCKETS.join(', ')}, and file_name is required` })
    return
  }

  const ext = (file_name.split('.').pop() || 'bin').toLowerCase()
  const path = `intake/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path)
  if (error) {
    console.error('intake/upload-url failed:', error)
    res.status(502).json({ error: error.message || 'Could not create an upload URL' })
    return
  }

  res.status(200).json({ bucket, storage_path: path, signed_url: data.signedUrl })
}
