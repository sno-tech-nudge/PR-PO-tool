import { supabase } from './supabase'

let cache = null
let loadPromise = null

// Supabase/PostgREST caps a single select at 1000 rows by default — the
// directory now holds 1200+ people, so a plain select silently truncates
// it. Page through with .range() until a page comes back short.
async function fetchAllDirectoryRows() {
  const pageSize = 1000
  let all = []
  let from = 0
  while (true) {
    const { data } = await supabase.from('zoho_directory').select('email, name, status').range(from, from + pageSize - 1)
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function preloadDirectory() {
  if (cache) return cache
  if (!loadPromise) {
    loadPromise = fetchAllDirectoryRows().then(data => {
      cache = new Map(data.map(r => [r.email.toLowerCase(), { name: r.name, status: r.status }]))
      return cache
    })
  }
  return loadPromise
}

export function getDisplayName(email) {
  if (!email) return email
  const entry = cache?.get(email.toLowerCase())
  return entry?.name || email
}

export function getAllDirectoryEntries() {
  if (!cache) return []
  return [...cache.entries()].map(([email, entry]) => ({ email, name: entry.name }))
}

// Active-only view — for pickers (e.g. the attendee multi-select) where
// offering someone whose Zoho account is Inactive/Deleted would be
// misleading. getDisplayName()/getAllDirectoryEntries() stay status-agnostic
// since they're used to resolve names for historical records too.
export function getActiveDirectoryEntries() {
  if (!cache) return []
  return [...cache.entries()]
    .filter(([, entry]) => entry.status === 'Active')
    .map(([email, entry]) => ({ email, name: entry.name }))
}
