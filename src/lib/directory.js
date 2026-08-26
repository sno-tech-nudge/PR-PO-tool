import { supabase } from './supabase'

// Name↔email lookup (zoho_directory, imported from the Zoho user export —
// see supabase_migration_zoho_directory.sql) used to show a real person's
// name instead of their raw email address across the app. Login and a
// user's own Settings/Profile view are the deliberate exceptions — those
// keep showing the email itself, per the standing rule for this feature.
//
// The whole table is small enough (~1,200 rows) to load once and cache in
// memory rather than round-tripping per lookup — preloadDirectory() is
// called once, early, from App.jsx. getDisplayName() is synchronous so
// every call site can use it directly at render time without threading
// loading state through; before the cache is ready (or for an email with
// no match — an outside contact, a since-removed account, a test address)
// it just falls back to the raw email, so nothing ever breaks or blocks.
let cache = null
let loadPromise = null

export async function preloadDirectory() {
  if (cache) return cache
  if (!loadPromise) {
    loadPromise = supabase.from('zoho_directory').select('email, name').then(({ data }) => {
      cache = new Map((data || []).map(r => [r.email.toLowerCase(), r.name]))
      return cache
    })
  }
  return loadPromise
}

export function getDisplayName(email) {
  if (!email) return email
  const name = cache?.get(email.toLowerCase())
  return name || email
}
