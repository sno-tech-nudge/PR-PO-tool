import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { EXPENSE_CATEGORIES, OTHER_CATEGORY } from './expenseCategories'
import { PR_CATEGORIES } from './prConstants'

// The category lists are the built-in ones plus any that grew out of "Other":
// when the same thing is typed under Other often enough, the database adds it to
// custom_categories (see supabase_migration_custom_categories.sql). Every picker
// uses this hook, so a new category shows up everywhere without a release.

let cache = null // active custom categories, [{ name, key }]
let inflight = null
const listeners = new Set()

export function refreshCustomCategories() {
  inflight = (async () => {
    try {
      const { data } = await supabase.from('custom_categories').select('name, key').eq('active', true).order('name')
      cache = data || []
    } catch {
      cache = cache || []
    }
    listeners.forEach(f => f())
  })()
  return inflight
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Custom categories go just before "Other", which stays last.
function withCustom(base, custom) {
  const extra = custom.filter(n => !base.some(b => same(b, n)))
  const at = base.indexOf(OTHER_CATEGORY)
  return at < 0 ? [...base, ...extra] : [...base.slice(0, at), ...extra, ...base.slice(at)]
}

export function useCategories() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    listeners.add(f)
    if (cache === null && !inflight) refreshCustomCategories()
    return () => { listeners.delete(f) }
  }, [])
  const custom = (cache || []).map(c => c.name)
  return { expense: withCustom(EXPENSE_CATEGORIES, custom), pr: withCustom(PR_CATEGORIES, custom), custom }
}

// "Stage hires" and "stage-hire" should find "Stage hire": a rough match, only used to
// suggest a category to someone who typed the same thing under Other.
const roughKey = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\band\b/g, ' ').replace(/\b(\w{3,})s\b/g, '$1').replace(/\s+/g, ' ').trim()

export function matchingCategory(text, list) {
  const k = roughKey(text)
  if (k.length < 3) return null
  return (list || []).find(c => c !== OTHER_CATEGORY && roughKey(c) === k) || null
}
