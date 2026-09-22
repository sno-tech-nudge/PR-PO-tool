// Shared server-side Supabase client + auth check for the api/intake/*
// routes, which are called by Nucleus's "intake-proxy" edge function, not by
// a logged-in browser session. Reuses the same anon key the rest of this
// app's frontend already uses — RLS on every table is already wide-open
// (`USING(true) WITH CHECK(true)`, see CLAUDE.md's "anon-key-trust model"),
// so there's no privilege gap between this and the browser client; a
// service-role key isn't provisioned and isn't needed for that reason.
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// The one thing that *is* privileged here: only Nucleus's edge function (the
// sole holder of PR_PO_INTAKE_SECRET) may call these routes at all, since
// they perform real submissions attributed to whatever `submitted_by` the
// caller sends. Every api/intake/* handler must call this first.
export function requireIntakeAuth(req, res) {
  const secret = process.env.PR_PO_INTAKE_SECRET
  if (!secret) {
    console.error('api/intake: PR_PO_INTAKE_SECRET is not configured')
    res.status(500).json({ error: 'Intake is not configured on the server.' })
    return false
  }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

export function getFiscalYearPrefix() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return m >= 4
    ? `${String(y).slice(2)}/${String(y + 1).slice(2)}`
    : `${String(y - 1).slice(2)}/${String(y).slice(2)}`
}

// Same atomic RPC src/components/vendor/VendorForm.jsx and
// src/components/pr/PRForm.jsx already call client-side — a real Postgres
// sequence under the hood, so a browser submission and an intake submission
// racing each other can never collide.
export async function nextDocNumber(kind) {
  const { data, error } = await supabaseAdmin.rpc('next_doc_number', { kind, fy_prefix: getFiscalYearPrefix() })
  if (error) throw error
  return data
}
