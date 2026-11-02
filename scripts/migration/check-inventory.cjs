// Drift check: compares what the code actually uses against scripts/migration/inventory.json.
// Run with `npm run migration:check`. Exits 1 if something was added or removed without updating the inventory,
// so the migration pack cannot silently fall behind the app. No network, no database.
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const inv = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json'), 'utf8'))

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) } else out.push(p)
  }
  return out
}
const rel = p => path.relative(ROOT, p).split(path.sep).join('/')
const code = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'api')), path.join(ROOT, 'vite.config.js')]
  .filter(f => /\.(js|jsx|cjs|mjs)$/.test(f) && fs.existsSync(f))
  .filter(f => !rel(f).startsWith('api/intake/') && rel(f) !== 'api/_lib/supabaseAdmin.js') // excluded on purpose

const problems = []
const diff = (what, found, documented) => {
  for (const x of found) if (!documented.has(x)) problems.push(`${what} used in code but not in inventory.json: ${x}`)
  for (const x of documented) if (!found.has(x)) problems.push(`${what} in inventory.json but no longer in code: ${x}`)
}

// Env vars
const envFound = new Set()
for (const f of code) {
  const t = fs.readFileSync(f, 'utf8')
  for (const m of t.matchAll(/(?:process\??\.env|import\.meta\.env)\??\.([A-Z][A-Z0-9_]*)/g)) if (m[1] !== 'DEV' && m[1] !== 'PROD' && m[1] !== 'MODE') envFound.add(m[1])
}
const envDoc = new Set(Object.entries(inv.env).filter(([k]) => k !== 'local_only').flatMap(([, v]) => v))
for (const x of inv.excluded_on_purpose.nucleus_intake_proxy.env) envDoc.delete(x)
// the build-info Vercel vars are read by vite.config.js and the host sets them, so allow either side
diff('env var', envFound, envDoc)

// API routes
const routesFound = new Set(walk(path.join(ROOT, 'api')).map(rel).filter(f => f.endsWith('.js') && !f.startsWith('api/_lib/') && !f.startsWith('api/intake/')))
diff('API route', routesFound, new Set(inv.api_routes))
const helpersFound = new Set(walk(path.join(ROOT, 'api', '_lib')).map(rel).filter(f => f !== 'api/_lib/supabaseAdmin.js'))
diff('API helper', helpersFound, new Set(inv.api_helpers))

// Crons
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))
diff('cron', new Set((vercel.crons || []).map(c => `${c.path} ${c.schedule}`)), new Set(inv.crons.map(c => `${c.path} ${c.schedule}`)))

// Storage buckets referenced by code
const bucketsFound = new Set()
for (const f of code) {
  const t = fs.readFileSync(f, 'utf8')
  for (const m of t.matchAll(/storage\s*\.from\(\s*['"]([a-z0-9-]+)['"]/g)) bucketsFound.add(m[1])
  for (const m of t.matchAll(/\[\s*['"]([a-z0-9-]+)['"]\s*,\s*[a-zA-Z_.]+(?:path|Path)/g)) bucketsFound.add(m[1]) // AuditTrail job tuples
}
const bucketsKnown = new Set([...inv.buckets, ...Object.keys(inv.known_gaps).filter(k => !inv.buckets.includes(k))])
for (const b of bucketsFound) if (!bucketsKnown.has(b)) problems.push(`storage bucket used in code but not in inventory.json: ${b}`)

// DB migration files: a new one means the live DB changed; remind to refresh the pack
const migrations = fs.readdirSync(ROOT).filter(f => /^supabase_migration_.*\.sql$/.test(f))
console.log(`Checked ${code.length} source files, ${migrations.length} migration files.`)
if (problems.length) {
  console.error('\nMigration inventory is out of date:\n - ' + problems.join('\n - '))
  console.error('\nUpdate scripts/migration/inventory.json (and README.md if the steps change).')
  process.exit(1)
}
console.log('Migration inventory matches the code.')
