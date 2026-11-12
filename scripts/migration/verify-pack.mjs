// Proves the migration pack loads: replays schema, data, sequences and event triggers into a clean in-memory
// Postgres (PGlite), then checks every table's row count against the export and that the system log is still
// append-only. Needs no database and touches nothing real.
//   npm install --no-save @electric-sql/pglite
//   node scripts/migration/verify-pack.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'

const here = path.dirname(fileURLToPath(import.meta.url))
const PACK = path.resolve(here, '..', '..', 'db_export_backup', 'migration_pack') + path.sep
const read = f => fs.readFileSync(PACK + f, 'utf8')

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
// Stand-ins for what a fresh Supabase project already has.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create extension if not exists pgcrypto; create extension if not exists "uuid-ossp";
`)
// Extensions Supabase ships with and PGlite lacks.
const schema = read('01_schema.sql').split('\n').filter(l => !/CREATE EXTENSION IF NOT EXISTS "(pg_stat_statements|supabase_vault|pgcrypto|uuid-ossp)"/.test(l)).join('\n')

let failed = false
for (const [name, sql] of [['01_schema', schema], ['02_data', read('02_data.sql')], ['03_sequences', read('03_sequences_setval.sql')], ['04_event_triggers', read('04_event_triggers.sql')]]) {
  try { await db.exec(sql); console.log(`ok   ${name}`) } catch (e) { console.log(`FAIL ${name}: ${e.message}`); process.exit(1) }
}

const summary = JSON.parse(read('summary.json'))
const tables = Object.entries(summary.row_counts)
let bad = 0
for (const [t, expected] of tables) {
  const { rows: [{ n }] } = await db.query(`select count(*)::int n from public."${t}"`)
  if (n !== expected) { bad++; console.log(`MISMATCH ${t}: exported ${expected}, loaded ${n}`) }
}
console.log(bad ? `FAIL: ${bad} table(s) differ` : `ok   all ${tables.length} tables match the export row for row`)
if (bad) failed = true

for (const sql of [`update public.system_logs set detail = 'x'`, `delete from public.system_logs`, `truncate public.system_logs`]) {
  try { await db.exec(sql); console.log(`FAIL not blocked: ${sql}`); failed = true } catch { console.log(`ok   blocked: ${sql.split(' ').slice(0, 3).join(' ')}`) }
}
const ev = (await db.query(`select evtname from pg_event_trigger order by 1`)).rows.map(r => r.evtname)
console.log(ev.includes('system_log_ddl') && ev.includes('system_log_drop') ? `ok   event triggers present (${ev.join(', ')})` : `FAIL event triggers: ${ev.join(', ')}`)
if (!(ev.includes('system_log_ddl') && ev.includes('system_log_drop'))) failed = true
process.exit(failed ? 1 : 0)
