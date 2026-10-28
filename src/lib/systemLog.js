/* global __BUILD__ */
import { supabase } from './supabase'

// System Logs: an append-only record, for admins, of changes to the system
// itself. The database records schema and team changes on its own (see
// supabase_migration_system_logs.sql); this file records what only the app can
// know: who downloaded a file, when maintenance started and ended, and when a
// new version went live.

// Whoever is signed in, so any part of the app can log without being handed the user.
let actor = null
export function setSystemActor(user) {
  actor = user ? { email: user.email || null, name: user.name || null } : null
}
export const systemActor = () => actor

// Fire-and-forget: a failure to record must never stop the action it describes.
export function logSystem({ category, action, target, detail, meta, ref, source = 'app', by }) {
  try {
    return supabase.from('system_logs').insert({
      category, action,
      target: target || null,
      detail: detail || null,
      actor_email: by ? by.email || null : actor?.email || null,
      actor_name: by ? by.name || null : actor?.name || null,
      source,
      ref: ref || null,
      meta: meta || null,
    }).then(({ error }) => { if (error && error.code !== '23505') console.error('system log failed:', error.message) })
  } catch (err) {
    console.error('system log failed:', err)
  }
}

// ----------------------------------------------------------------- deployments
// The build stamps itself with the commit it was made from (see vite.config.js).
// The first person to open a new version records it, once: the unique ref makes
// every later open a no-op. Local development and previews are not recorded.
export function recordDeployment() {
  const b = typeof __BUILD__ !== 'undefined' ? __BUILD__ : null
  if (!b?.sha || b.env !== 'production') return
  logSystem({
    category: 'deployment', action: 'deployed', source: 'deploy', ref: b.sha,
    target: b.sha.slice(0, 7),
    detail: String(b.message || '').split('\n')[0] || null,
    meta: { sha: b.sha, built_at: b.builtAt, author: b.author },
    // credited to whoever committed the change, not whoever happened to open it first
    by: { email: b.author || null, name: null },
  })
}

// ----------------------------------------------------------------- maintenance
export async function getMaintenance() {
  const { data } = await supabase.from('system_state').select('value, updated_at, updated_by').eq('key', 'maintenance').maybeSingle()
  return { on: false, ...(data?.value || {}) }
}

export async function startMaintenance({ reason, block }) {
  const startedAt = new Date().toISOString()
  const value = { on: true, block: !!block, reason: reason || null, started_at: startedAt, started_by: actor?.email || null, started_by_name: actor?.name || null }
  const { error } = await supabase.from('system_state').upsert({ key: 'maintenance', value, updated_at: startedAt, updated_by: actor?.email || null })
  if (error) throw error
  logSystem({
    category: 'maintenance', action: 'started', detail: reason || 'No reason given',
    meta: { block: !!block, started_at: startedAt },
  })
  return value
}

export async function endMaintenance() {
  const current = await getMaintenance()
  const endedAt = new Date().toISOString()
  const { error } = await supabase.from('system_state').upsert({ key: 'maintenance', value: { on: false }, updated_at: endedAt, updated_by: actor?.email || null })
  if (error) throw error
  const seconds = current.started_at ? Math.max(0, Math.round((Date.now() - new Date(current.started_at).getTime()) / 1000)) : null
  logSystem({
    category: 'maintenance', action: 'ended',
    detail: seconds != null ? `Lasted ${formatDuration(seconds)}${current.reason ? `. ${current.reason}` : ''}` : current.reason || null,
    meta: { started_at: current.started_at || null, ended_at: endedAt, duration_seconds: seconds, started_by: current.started_by || null },
  })
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
