// Loads the tool's tables and data into the NUCLEUS Supabase project (a database that already has other tables).
//   TARGET_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" CONFIRM_PROJECT_REF=<ref> \
//     node scripts/migration/apply-nucleus.cjs [--dry-run | --schema-only | --data-only]
//
// Default (no flag) does everything in order: pre-flight, schema (docs/database/nucleus_schema.sql), data (02_data.sql),
// sequence positions (03_sequences_setval.sql), then a row-count check against summary.json.
// It never installs the schema-change event triggers (04_event_triggers.sql) and never touches any table it did not create.
// Needs the private package unzipped into db_export_backup/migration_pack/ for the data steps.
//
// Safety:
//   - CONFIRM_PROJECT_REF must equal the project ref inside TARGET_DB_URL, so a pasted URL cannot hit the wrong project.
//   - Refuses to run against the old tool's project (SOURCE_DB_URL / SUPABASE_DB_URL in .env.local).
//   - Pre-flight lists clashing tables/functions and stops; the schema file repeats that check inside the database.
//   - The schema step and the data step are each ONE transaction: either all of it applies or none.
//   - Data is only loaded into tables that are empty.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..', '..')
const PACK = path.join(ROOT, 'db_export_backup', 'migration_pack')
const SCHEMA = path.join(ROOT, 'docs', 'database', 'nucleus_schema.sql')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const schemaOnly = args.includes('--schema-only')
const dataOnly = args.includes('--data-only')
if ([dryRun, schemaOnly, dataOnly].filter(Boolean).length > 1) throw new Error('Use at most one of --dry-run, --schema-only, --data-only')

const TARGET = process.env.TARGET_DB_URL
if (!TARGET) throw new Error('Set TARGET_DB_URL to the NUCLEUS project\'s Postgres connection string')
const refOf = u => (u.match(/postgres\.([a-z0-9]+)[:@]/) || u.match(/db\.([a-z0-9]+)\.supabase\.co/) || [])[1]
const targetRef = refOf(TARGET)
if (!targetRef) throw new Error('Could not find a project ref in TARGET_DB_URL (expected postgres.<ref>@... or db.<ref>.supabase.co)')
if (process.env.CONFIRM_PROJECT_REF !== targetRef) {
  throw new Error(`Set CONFIRM_PROJECT_REF=${targetRef} to confirm you mean to write to that project (it must match the connection string).`)
}
let sourceUrl = process.env.SOURCE_DB_URL
if (!sourceUrl) {
  try { const m = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m); sourceUrl = m && m[1].trim() } catch { /* no .env.local */ }
}
if (sourceUrl && refOf(sourceUrl) === targetRef) throw new Error('TARGET_DB_URL is the old tool\'s project. Refusing to continue.')

const read = f => fs.readFileSync(f, 'utf8')

async function main() {
  if (!fs.existsSync(SCHEMA)) throw new Error('docs/database/nucleus_schema.sql not found. Run: node scripts/migration/gen-nucleus-schema.cjs')
  const schemaSql = read(SCHEMA)
  const tables = [...schemaSql.matchAll(/^CREATE TABLE IF NOT EXISTS "public"\."([a-z_0-9]+)"/gm)].map(m => m[1])
  const functions = [...schemaSql.matchAll(/^CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\(/gm)].map(m => m[1])

  const c = new Client({ connectionString: TARGET, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const q = (sql, p) => c.query(sql, p).then(r => r.rows)

  console.log(`Target project: ${targetRef}`)
  const [{ n: before }] = await q(`select count(*)::int n from pg_tables where schemaname = 'public'`)
  console.log(`Target has ${before} tables in public already (they are not touched).`)
  const [{ ok: hasEmployees }] = await q(`select to_regclass('public.employees') is not null ok`)
  if (!hasEmployees) throw new Error('public.employees not found: this does not look like the Nucleus database.')

  const existing = await q(`select tablename as n from pg_tables where schemaname = 'public' and tablename = any($1)`, [tables])
  const existingFns = await q(`select distinct p.proname as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = any($1)`, [[...functions, 'prpo_jwt_email', 'prpo_is_staff', 'prpo_is_admin']])

  if (!dataOnly) {
    if (existing.length || existingFns.length) {
      console.log('\nCLASH: these already exist in the target, so the schema step will not run:')
      for (const r of existing) {
        const [{ n }] = await q(`select count(*)::int n from public."${r.n}"`)
        console.log(`  table ${r.n}  (${n} rows)`)
      }
      for (const r of existingFns) console.log(`  function ${r.n}`)
      console.log('\nIf they are empty leftovers, drop them deliberately (with the Nucleus owner\'s approval) and run again. If they hold data, stop and tell the owner.')
      await c.end(); process.exit(2)
    }
    console.log(`Pre-flight clean: none of the ${tables.length} tables or ${functions.length} functions exist yet.`)
  }
  if (dryRun) { console.log('Dry run: nothing changed.'); await c.end(); return }

  if (!dataOnly) {
    const t0 = Date.now()
    await c.query(schemaSql)
    console.log(`  schema  ok  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  }
  if (schemaOnly) { console.log('Schema applied. Data not loaded (--schema-only).'); await c.end(); return }

  // Data: every tool table must exist and be empty.
  const missing = []
  const nonEmpty = []
  for (const t of tables) {
    const [{ ok }] = await q(`select to_regclass($1) is not null ok`, [`public."${t}"`])
    if (!ok) { missing.push(t); continue }
    const [{ n }] = await q(`select count(*)::int n from public."${t}"`)
    if (n > 0) nonEmpty.push(`${t} (${n})`)
  }
  if (missing.length) throw new Error(`Tables missing, run the schema step first: ${missing.join(', ')}`)
  if (nonEmpty.length) throw new Error(`Refusing to load data: these tables already contain rows: ${nonEmpty.join(', ')}`)
  for (const f of ['02_data.sql', '03_sequences_setval.sql', 'summary.json']) {
    if (!fs.existsSync(path.join(PACK, f))) throw new Error(`${f} not found in db_export_backup/migration_pack/. Unzip the private package there first.`)
  }
  for (const f of ['02_data.sql', '03_sequences_setval.sql']) {
    const t0 = Date.now()
    await c.query(read(path.join(PACK, f)))
    console.log(`  ${f}  ok  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  }

  const summary = JSON.parse(read(path.join(PACK, 'summary.json')))
  let bad = 0
  for (const [table, expected] of Object.entries(summary.row_counts)) {
    const [{ n }] = await q(`select count(*)::int n from public."${table}"`)
    if (n !== expected) { bad++; console.log(`  MISMATCH ${table}: expected ${expected}, got ${n}`) }
  }
  console.log(bad ? `Row counts: ${bad} table(s) differ.` : `Row counts: all ${Object.keys(summary.row_counts).length} tables match the export.`)
  console.log('\nNext: upload the stored files (node scripts/migration/upload-storage.cjs). The event triggers (04) were not installed, on purpose.')
  await c.end()
  if (bad) process.exit(1)
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
