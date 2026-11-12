// Proves docs/database/nucleus_schema.sql is safe and works, without touching any real database. It builds an in-memory
// Postgres (PGlite) that looks like the Nucleus project (Supabase roles, auth.jwt(), storage schema, an `employees` table and
// some unrelated tables), then:
//   1. applies the Nucleus schema, the data and the sequence positions, and compares every row count with the export;
//   2. checks the sign-in-only rules: anon is shut out, unknown / inactive people see nothing, active staff can work,
//      only admins can read the System Log, the log can never be edited, storage follows the same rule;
//   3. checks the pre-flight: a clashing table makes the migration stop and change nothing; unrelated tables are untouched.
//   npm install   (PGlite is a dev dependency)       then:   node scripts/migration/verify-nucleus-schema.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..')
const PACK = path.join(ROOT, 'db_export_backup', 'migration_pack')
const SCHEMA = fs.readFileSync(path.join(ROOT, 'docs', 'database', 'nucleus_schema.sql'), 'utf8')
  // extensions Supabase has already / PGlite loads another way (same stand-in as verify-pack.mjs)
  .split('\n').filter(l => !/CREATE EXTENSION IF NOT EXISTS "(pgcrypto|uuid-ossp)"/.test(l)).join('\n')
const summary = JSON.parse(fs.readFileSync(path.join(PACK, 'summary.json'), 'utf8'))

let failures = 0
const ok = (m) => console.log(`ok   ${m}`)
const fail = (m) => { failures++; console.log(`FAIL ${m}`) }
const check = (cond, m) => (cond ? ok(m) : fail(m))

async function nucleusLike(extra = '') {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists "uuid-ossp" with schema extensions;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, service_role; grant all on storage.objects to authenticated;
    grant usage on schema public to anon, authenticated, service_role;
    -- what Nucleus already has
    create table public.employees (id uuid primary key default gen_random_uuid(), email text, is_active boolean default true, erp_role text default 'member');
    insert into public.employees (email, is_active, erp_role) values
      ('member@nucleus.test', true, 'member'), ('admin@nucleus.test', true, 'admin'),
      ('gone@nucleus.test', false, 'member');
    create table public.notifications (id int primary key, body text);
    insert into public.notifications values (1, 'hello from nucleus');
    create function public.is_finance_admin() returns boolean language sql as $$ select false $$;
    ${extra}
  `)
  return db
}
const asUser = async (db, email, role = 'authenticated') => {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify(email ? { email } : {})}', false); set role ${role};`)
}
const count = async (db, t) => (await db.query(`select count(*)::int n from public."${t}"`)).rows[0].n
const attempt = async (db, sql) => { try { await db.exec(sql); return null } catch (e) { return e.message } }

// ===== 1. clean Nucleus-like database: apply, load, count =====
let db = await nucleusLike()
for (const [name, sql] of [['nucleus_schema.sql', SCHEMA], ['02_data.sql', fs.readFileSync(path.join(PACK, '02_data.sql'), 'utf8')], ['03_sequences_setval.sql', fs.readFileSync(path.join(PACK, '03_sequences_setval.sql'), 'utf8')]]) {
  const err = await attempt(db, sql)
  if (err) { fail(`${name}: ${err}`); process.exit(1) } else ok(`applied ${name}`)
}
let bad = 0
for (const [t, expected] of Object.entries(summary.row_counts)) { const n = await count(db, t); if (n !== expected) { bad++; console.log(`  MISMATCH ${t}: exported ${expected}, loaded ${n}`) } }
check(!bad, `all ${Object.keys(summary.row_counts).length} tables match the export row for row`)
check((await db.query(`select count(*)::int n from public.notifications`)).rows[0].n === 1, 'unrelated Nucleus tables are untouched')
const ev = (await db.query(`select count(*)::int n from pg_event_trigger`)).rows[0].n
check(ev === 0, 'no schema-change event triggers were installed')
const nextPr = (await db.query(`select public.next_doc_number('PR', '26/27') as n`)).rows[0].n
check(/-0054$/.test(nextPr), `document numbers continue the old sequence (next PR is ${nextPr})`)
const pol = (await db.query(`select count(*)::int n from pg_policies where policyname like 'prpo\\_%'`)).rows[0].n
check(pol === 30, `30 sign-in-only policies present (${pol})`)
check((await db.query(`select count(*)::int n from pg_policies where qual = 'true' or with_check = 'true'`)).rows[0].n === 0, 'no open-to-everyone policy remains')

// ===== 2. access rules =====
await asUser(db, null, 'anon')
let e = await attempt(db, `select count(*) from public.vendors`)
check(/permission denied/i.test(e || ''), 'anon (not signed in) is shut out of vendors')
e = await attempt(db, `select count(*) from public.team_members`)
check(/permission denied/i.test(e || ''), 'anon is shut out of team_members')

await asUser(db, 'nobody@elsewhere.test')
check((await count(db, 'vendors')) === 0, 'a signed-in person who is not an employee sees no vendors')
e = await attempt(db, `insert into public.system_state (key, value) values ('x', '{}'::jsonb)`)
check(/row-level security/i.test(e || ''), `and cannot write: stopped by row-level security (${(e||'no error').slice(0,70)})`)

await asUser(db, 'gone@nucleus.test')
check((await count(db, 'purchase_orders')) === 0 && (await count(db, 'vendors')) === 0, 'an inactive employee sees nothing')
await db.exec('reset role'); const realPo = (await db.query('select count(*)::int n from public.purchase_orders')).rows[0].n; check(realPo > 0, `(control: the rows do exist, ${realPo} purchase orders, so the zero is the policy at work)`); await asUser(db, 'gone@nucleus.test')

await asUser(db, 'MEMBER@nucleus.test')
check((await count(db, 'vendors')) === summary.row_counts.vendors, 'an active employee can read vendors (email match ignores case)')
check((await count(db, 'system_logs')) === 0, 'an ordinary employee cannot read the System Log')
e = await attempt(db, `insert into public.system_logs (category, action) values ('test', 'test')`)
check(e === null, `an ordinary employee can still write to the System Log (the app logs as the user)${e ? ': ' + e : ''}`)
e = await attempt(db, `truncate public.vendors`)
check(/permission denied/i.test(e || ''), 'no signed-in user can truncate a table')

await asUser(db, 'admin@nucleus.test')
check((await count(db, 'system_logs')) >= summary.row_counts.system_logs, 'an admin can read the System Log')
for (const sql of [`update public.system_logs set action = 'x'`, `delete from public.system_logs`]) {
  e = await attempt(db, sql)
  check(/permission denied/i.test(e || ''), `an admin has no update or delete right on the System Log: ${sql.split(' ').slice(0, 3).join(' ')}`)
}

// the log's own triggers, as the database owner (who has every privilege)
await db.exec('reset role')
for (const sql of [`update public.system_logs set action = 'x'`, `delete from public.system_logs`, `truncate public.system_logs`]) {
  e = await attempt(db, sql)
  check(!!e && !/permission denied/i.test(e), `even the owner cannot edit the System Log (trigger): ${sql.split(' ').slice(0, 3).join(' ')} -> ${(e||'allowed').slice(0,60)}`)
}

// storage
await asUser(db, 'member@nucleus.test')
e = await attempt(db, `insert into storage.objects (bucket_id, name) values ('vendor-documents', 'x/y.pdf')`)
check(e === null, 'active employee can store a file in a tool bucket')
e = await attempt(db, `insert into storage.objects (bucket_id, name) values ('some-other-nucleus-bucket', 'x/y.pdf')`)
check(!!e, 'and the policy does not open any other bucket')
await asUser(db, 'nobody@elsewhere.test')
e = await attempt(db, `insert into storage.objects (bucket_id, name) values ('vendor-documents', 'x/z.pdf')`)
check(!!e, 'a non-employee cannot store a file in a tool bucket')
await db.exec('reset role')
await db.close()

// ===== 3. pre-flight: a clashing table stops everything =====
db = await nucleusLike(`create table public.vendors (id int primary key, note text); insert into public.vendors values (1, 'someone else''s data');`)
e = await attempt(db, SCHEMA)
check(/already has objects with the tool/i.test(e || '') && /vendors/.test(e || ''), 'a clashing table makes the migration stop with a clear message')
const tablesAfter = (await db.query(`select count(*)::int n from pg_tables where schemaname='public'`)).rows[0].n
check(tablesAfter === 3, `nothing was created or changed after the stop (${tablesAfter} tables: employees, notifications, vendors)`)
check((await count(db, 'vendors')) === 1, 'the clashing table and its row are untouched')
await db.close()

db = await nucleusLike(`create function public.next_doc_number(kind text, fy text) returns text language sql as $$ select 'other'::text $$;`)
e = await attempt(db, SCHEMA)
check(/next_doc_number/.test(e || ''), 'a clashing function stops the migration too (it is never silently replaced)')
await db.close()

// the schema must refuse a database that is not Nucleus
const bare = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
await bare.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema extensions; create schema auth; create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (id uuid, bucket_id text, name text);`)
e = await attempt(bare, SCHEMA)
check(/public\.employees was not found/.test(e || ''), 'a database without an employees table is refused')
await bare.close()

const odd = new PGlite({ extensions: { pgcrypto, uuid_ossp } })
await odd.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema extensions; create schema auth; create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (id uuid, bucket_id text, name text);
  create table public.employees (id uuid, email text);`)
e = await attempt(odd, SCHEMA)
check(/must have the columns/.test(e || ''), 'an employees table without is_active and erp_role is refused with an explanation')
await odd.close()

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
