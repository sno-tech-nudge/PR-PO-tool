// Loads the export from export-db.cjs into a NEW Supabase project.
//   TARGET_DB_URL="postgresql://postgres:...@...pooler.supabase.com:5432/postgres" node scripts/migration/apply-db.cjs
// Order: schema, data, sequence positions, event triggers, then a row-count check against the export.
// Guards: refuses to run against the source project, and against a target that already has tables.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..', '..')
const PACK = path.join(ROOT, 'db_export_backup', 'migration_pack')
const TARGET = process.env.TARGET_DB_URL
if (!TARGET) throw new Error('Set TARGET_DB_URL to the NEW project\'s Postgres connection string')

const refOf = u => (u.match(/postgres\.([a-z0-9]+)[:@]/) || u.match(/db\.([a-z0-9]+)\.supabase\.co/) || [])[1]
let sourceUrl = process.env.SOURCE_DB_URL
if (!sourceUrl) {
  try { const m = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m); sourceUrl = m && m[1].trim() } catch { /* no .env.local */ }
}
if (sourceUrl && refOf(sourceUrl) && refOf(sourceUrl) === refOf(TARGET)) {
  throw new Error('TARGET_DB_URL points at the same project as the source. Refusing to continue.')
}

async function run(c, file) {
  const sql = fs.readFileSync(path.join(PACK, file), 'utf8')
  const t0 = Date.now()
  await c.query(sql)
  console.log(`  ${file}  ok  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}

async function main() {
  const c = new Client({ connectionString: TARGET, ssl: { rejectUnauthorized: false } })
  await c.connect()

  const { rows: [{ n }] } = await c.query(`select count(*)::int n from pg_tables where schemaname = 'public'`)
  if (n > 0) throw new Error(`Target already has ${n} tables in public. Use an empty project (or drop them) first.`)

  console.log('Applying to target...')
  await run(c, '01_schema.sql')
  await run(c, '02_data.sql')
  await run(c, '03_sequences_setval.sql')
  await run(c, '04_event_triggers.sql')

  const summary = JSON.parse(fs.readFileSync(path.join(PACK, 'summary.json'), 'utf8'))
  let bad = 0
  for (const [table, expected] of Object.entries(summary.row_counts)) {
    const { rows: [{ n: got }] } = await c.query(`select count(*)::int n from public."${table}"`)
    // team_members / system_logs may gain rows from triggers; compare >= for those, exact for the rest
    const ok = got === expected
    if (!ok) { bad++; console.log(`  MISMATCH ${table}: expected ${expected}, got ${got}`) }
  }
  console.log(bad ? `Row counts: ${bad} table(s) differ.` : 'Row counts: all tables match the export.')
  await c.end()
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
