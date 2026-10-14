import { supabase } from './supabase'
import { sameVendor } from './duplicateCheck'

// The registered vendor list, loaded once and kept for the session. Vendor
// payments must name a registered vendor; reimbursements get a quiet match so
// the expense can be tied to the vendor without anyone picking from a list.
let registryPromise = null

export function loadVendorRegistry(force = false) {
  if (!registryPromise || force) {
    registryPromise = supabase
      .from('vendors')
      .select('id, vendor_id, org_name, gstin, pan_number, status')
      .eq('status', 'approved')
      .order('org_name', { ascending: true })
      .limit(5000)
      .then(({ data }) => data || [])
      .catch(() => [])
  }
  return registryPromise
}

const clean = s => String(s || '').toUpperCase().replace(/\s+/g, '')

// { vendor, how: 'gstin' | 'name' } or null. A GSTIN is exact; a name has to
// be clearly the same business, since a wrong match would mis-tag the expense.
export function matchVendor(registry, { name, gstin }) {
  const g = clean(gstin)
  if (g.length === 15) {
    const hit = registry.find(v => clean(v.gstin) === g)
    if (hit) return { vendor: hit, how: 'gstin' }
  }
  if (name && String(name).trim().length >= 3) {
    const hit = registry.find(v => sameVendor(name, v.org_name))
    if (hit) return { vendor: hit, how: 'name' }
  }
  return null
}
