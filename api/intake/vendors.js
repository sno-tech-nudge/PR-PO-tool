// Called by Nucleus's Purchase Request form to populate its vendor picker —
// a PR can only be raised against an already-approved vendor
// (src/components/pr/VendorSelector.jsx enforces the same
// status:'approved' filter for the in-tool picker).
import { supabaseAdmin, requireIntakeAuth } from '../_lib/supabaseAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireIntakeAuth(req, res)) return

  const status = req.query?.status || 'approved'

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .select('id, org_name')
    .eq('status', status)
    .order('org_name')

  if (error) {
    console.error('intake/vendors failed:', error)
    res.status(502).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true, vendors: (data || []).map(v => ({ id: v.id, name: v.org_name })) })
}
