// Copies every file in the source project's storage buckets to the new project, keeping the exact
// bucket and path (the database stores those paths, so they must not change).
//   TARGET_SUPABASE_URL=https://NEW.supabase.co TARGET_SERVICE_ROLE_KEY=... node scripts/migration/copy-storage.cjs
// Source: SOURCE_SUPABASE_URL / SOURCE_SUPABASE_KEY, else VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local.
// Reads the file list from db_export_backup/migration_pack/storage_inventory.json (made by export-db.cjs).
// Safe to re-run: files already copied are overwritten with identical content.
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..', '..')
const PACK = path.join(ROOT, 'db_export_backup', 'migration_pack')

const env = {}
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
  }
} catch { /* no .env.local */ }

const srcUrl = process.env.SOURCE_SUPABASE_URL || env.VITE_SUPABASE_URL
const srcKey = process.env.SOURCE_SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY
const dstUrl = process.env.TARGET_SUPABASE_URL
const dstKey = process.env.TARGET_SERVICE_ROLE_KEY
if (!srcUrl || !srcKey || !dstUrl || !dstKey) throw new Error('Need source URL/key (or .env.local) and TARGET_SUPABASE_URL + TARGET_SERVICE_ROLE_KEY')
if (srcUrl.replace(/\/$/, '') === dstUrl.replace(/\/$/, '')) throw new Error('Source and target are the same project. Refusing to continue.')

const src = createClient(srcUrl, srcKey, { auth: { persistSession: false } })
const dst = createClient(dstUrl, dstKey, { auth: { persistSession: false } })

async function copyOne(o) {
  const { data, error } = await src.storage.from(o.bucket_id).download(o.name)
  if (error) throw new Error('download: ' + (error.message || error))
  const body = Buffer.from(await data.arrayBuffer())
  const { error: upErr } = await dst.storage.from(o.bucket_id).upload(o.name, body, { upsert: true, contentType: o.mimetype || data.type || 'application/octet-stream' })
  if (upErr) throw new Error('upload: ' + (upErr.message || upErr))
  return body.length
}

async function main() {
  const inv = JSON.parse(fs.readFileSync(path.join(PACK, 'storage_inventory.json'), 'utf8'))
  console.log(`Copying ${inv.length} files...`)
  const failures = []
  let done = 0, bytes = 0, i = 0
  const worker = async () => {
    while (i < inv.length) {
      const o = inv[i++]
      try { bytes += await copyOne(o) } catch (e) { failures.push({ bucket: o.bucket_id, name: o.name, error: e.message }) }
      if (++done % 25 === 0 || done === inv.length) console.log(`  ${done}/${inv.length}`)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  fs.writeFileSync(path.join(PACK, 'storage_copy_failures.json'), JSON.stringify(failures, null, 1))
  console.log(`Done. Copied ${inv.length - failures.length}/${inv.length} files, ${(bytes / 1048576).toFixed(1)} MB. Failures: ${failures.length}${failures.length ? ' (see storage_copy_failures.json)' : ''}`)
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
