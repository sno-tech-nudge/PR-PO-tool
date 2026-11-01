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
// Maintenance is a window: it can start now or at a set time, and end when an
// admin ends it or at a set time. While it is active everyone except admins is
// held back; admins keep full access and can end it at any moment.
//
// The state is one row: { on, reason, scheduled_start, scheduled_end, created_at,
// set_by, set_by_name }. What it means right now is worked out from the clock.
export function maintenanceStatus(state, now = Date.now()) {
  if (!state?.on) return 'off'
  const start = state.scheduled_start ? new Date(state.scheduled_start).getTime() : 0
  const end = state.scheduled_end ? new Date(state.scheduled_end).getTime() : null
  if (now < start) return 'scheduled'
  if (end != null && now >= end) return 'expired'
  return 'active'
}

export async function getMaintenance() {
  const { data } = await supabase.from('system_state').select('value, updated_at, updated_by').eq('key', 'maintenance').maybeSingle()
  return { on: false, ...(data?.value || {}) }
}

const fmtWhen = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// startAt / endAt are Dates (or null: start now / end when an admin ends it).
export async function scheduleMaintenance({ reason, startAt, endAt }) {
  const createdAt = new Date().toISOString()
  const start = startAt && startAt.getTime() > Date.now() + 5000 ? startAt.toISOString() : createdAt
  const value = {
    on: true, reason: reason || null, scheduled_start: start, scheduled_end: endAt ? endAt.toISOString() : null,
    created_at: createdAt, set_by: actor?.email || null, set_by_name: actor?.name || null,
  }
  const { error } = await supabase.from('system_state').upsert({ key: 'maintenance', value, updated_at: createdAt, updated_by: actor?.email || null })
  if (error) throw error
  const planned = value.scheduled_end ? ` until ${fmtWhen(value.scheduled_end)}` : ''
  if (start === createdAt) {
    logSystem({ category: 'maintenance', action: 'started', ref: `maint-start-${createdAt}`, detail: `${reason || 'No reason given'}${planned ? `. Planned${planned}` : ''}`, meta: { started_at: createdAt, planned_end: value.scheduled_end } })
  } else {
    logSystem({ category: 'maintenance', action: 'scheduled', detail: `From ${fmtWhen(start)}${planned}. ${reason || 'No reason given'}`, meta: { scheduled_start: start, scheduled_end: value.scheduled_end } })
  }
  return value
}

// Ends an active window, or cancels one that has not started. `auto` is for a
// window that reached its end time by itself.
export async function endMaintenance({ auto = false } = {}) {
  const current = await getMaintenance()
  if (!current.on) return
  const status = maintenanceStatus(current)
  const endedAt = auto && current.scheduled_end ? current.scheduled_end : new Date().toISOString()
  const { error } = await supabase.from('system_state').upsert({ key: 'maintenance', value: { on: false }, updated_at: new Date().toISOString(), updated_by: actor?.email || null })
  if (error) throw error
  const by = auto ? { email: current.set_by || null, name: current.set_by_name || null } : undefined
  if (status === 'scheduled') {
    logSystem({ category: 'maintenance', action: 'cancelled', ref: `maint-cancel-${current.created_at}`, detail: `Scheduled for ${fmtWhen(current.scheduled_start)} was cancelled${current.reason ? `. ${current.reason}` : ''}`, by })
    return
  }
  const seconds = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(current.scheduled_start || current.created_at).getTime()) / 1000))
  logSystem({
    category: 'maintenance', action: 'ended', ref: `maint-end-${current.created_at}`, by,
    detail: `${auto ? 'Ended at its planned time. ' : ''}Lasted ${formatDuration(seconds)}${current.reason ? `. ${current.reason}` : ''}`,
    meta: { started_at: current.scheduled_start || null, ended_at: endedAt, duration_seconds: seconds, planned_end: current.scheduled_end || null, automatic: auto },
  })
}

// Run by every signed-in browser each time it checks. When a scheduled window
// has begun or has reached its end, whoever notices first records it (the unique
// ref makes a second attempt a no-op) and, at the end, switches maintenance off.
const synced = new Set()
export function syncMaintenance(state) {
  const status = maintenanceStatus(state)
  const key = `${state?.created_at}:${status}`
  if (!state?.on || synced.has(key)) return
  if (status === 'active') {
    synced.add(key)
    logSystem({
      category: 'maintenance', action: 'started', ref: `maint-start-${state.created_at}`,
      detail: `${state.reason || 'Scheduled maintenance'} began${state.scheduled_end ? `. Planned until ${fmtWhen(state.scheduled_end)}` : ''}`,
      by: { email: state.set_by || null, name: state.set_by_name || null },
      meta: { started_at: state.scheduled_start, planned_end: state.scheduled_end },
    })
  } else if (status === 'expired') {
    synced.add(key)
    endMaintenance({ auto: true }).catch(() => {})
  }
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
