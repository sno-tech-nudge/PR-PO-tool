// Called by Nucleus's Vendor Registration form as the PAN field is typed —
// mirrors VendorForm.jsx's checkPanDuplicates(): informational only, Finance's
// explicit requirement is that a duplicate PAN never blocks a submission
// (see api/intake/vendor.js, which still inserts regardless).
import { supabaseAdmin, requireIntakeAuth } from '../_lib/supabaseAdmin.js'

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireIntakeAuth(req, res)) return

  const pan = (req.query?.pan || '').toUpperCase().trim()
  if (!PAN_RE.test(pan)) {
    res.status(400).json({ error: 'pan must be a valid PAN (e.g. ABCDE1234F)' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .select('id, vendor_id, org_name, status')
    .eq('pan_number', pan)

  if (error) {
    console.error('intake/check-pan failed:', error)
    res.status(502).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true, duplicates: data || [] })
}
