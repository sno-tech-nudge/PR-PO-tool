// Uploads the stored files from the handover package (or from download-storage.cjs) into a NEW Supabase project's
// buckets, keeping the exact bucket and path (the database stores those paths, so they must not change).
// Needs no access to the old project: use this when all you have is the DATA_PRIVATE zip.
//   TARGET_SUPABASE_URL=https://NEW.supabase.co TARGET_SERVICE_ROLE_KEY=... node scripts/migration/upload-storage.cjs
// Reads  db_export_backup/migration_pack/storage_inventory.json  and  db_export_backup/migration_pack/storage/<bucket>/<path>
// (unzip the DATA_PRIVATE package into db_export_backup/migration_pack/ first). The buckets must already exist: loading
// docs/database/schema.sql (via apply-db.cjs) creates them. Safe to re-run: existing files are overwritten with identical content.
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..', '..')
const PACK = path.join(ROOT, 'db_export_backup', 'migration_pack')
const FILES = path.join(PACK, 'storage')

const url = process.env.TARGET_SUPABASE_URL
const key = process.env.TARGET_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Set TARGET_SUPABASE_URL and TARGET_SERVICE_ROLE_KEY (the NEW project\'s service role key)')
if (!fs.existsSync(FILES)) throw new Error(`No files found at ${FILES}. Unzip the DATA_PRIVATE package into db_export_backup/migration_pack/ first.`)
const dst = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const inv = JSON.parse(fs.readFileSync(path.join(PACK, 'storage_inventory.json'), 'utf8'))
  console.log(`Uploading ${inv.length} files to ${url} ...`)
  const failures = []
  let done = 0, bytes = 0, i = 0
  const worker = async () => {
    while (i < inv.length) {
      const o = inv[i++]
      try {
        const file = path.join(FILES, o.bucket_id, ...String(o.name).split('/'))
        if (!fs.existsSync(file)) throw new Error('file missing from the package')
        const body = fs.readFileSync(file)
        const { error } = await dst.storage.from(o.bucket_id).upload(o.name, body, { upsert: true, contentType: o.mimetype || 'application/octet-stream' })
        if (error) throw new Error(error.message || String(error))
        bytes += body.length
      } catch (e) { failures.push({ bucket: o.bucket_id, name: o.name, error: e.message }) }
      if (++done % 25 === 0 || done === inv.length) console.log(`  ${done}/${inv.length}`)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  fs.writeFileSync(path.join(PACK, 'storage_upload_failures.json'), JSON.stringify(failures, null, 1))
  console.log(`Done. Uploaded ${inv.length - failures.length}/${inv.length} files, ${(bytes / 1048576).toFixed(1)} MB. Failures: ${failures.length}${failures.length ? ' (see storage_upload_failures.json)' : ''}`)
  if (failures.length) process.exitCode = 1
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
