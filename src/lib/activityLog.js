import { supabase } from './supabase'

// Fire-and-forget: a logging failure must never block or fail the real
// business action it sits next to, so errors are swallowed (console only).
// `actor` is the logged-in user object ({ email, name }); when someone acts
// as a delegate, pass `onBehalfOf` (the delegator's email) so the trail shows
// who actually clicked and for whom.
export function logActivity({ entityType, entityId, entityRef, action, fromValue, toValue, actor, onBehalfOf, note }) {
  try {
    supabase.from('activity_log').insert({
      entity_type: entityType,
      entity_id: String(entityId ?? ''),
      entity_ref: entityRef || null,
      action,
      from_value: fromValue ?? null,
      to_value: toValue ?? null,
      actor_email: actor?.email || null,
      actor_name: actor?.name || null,
      on_behalf_of: onBehalfOf || null,
      note: note || null,
    }).then(({ error }) => {
      if (error) console.error('activity_log insert failed:', error.message)
    })
  } catch (err) {
    console.error('activity_log insert failed:', err)
  }
}
