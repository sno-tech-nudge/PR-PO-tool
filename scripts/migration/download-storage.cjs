// Downloads every file in the source storage buckets to disk, keeping bucket and path, so the files can be
// moved to ANY storage service (copy-storage.cjs does a direct Supabase to Supabase copy instead).
//   node scripts/migration/download-storage.cjs
// Reads the file list from db_export_backup/migration_pack/storage_inventory.json (made by export-db.cjs) and
// writes db_export_backup/migration_pack/storage/<bucket>/<path>. Source: SOURCE_SUPABASE_URL / SOURCE_SUPABASE_KEY,
// else VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local. Read-only on the source; safe to re-run
// (a file already on disk with the right size is skipped). These files include vendor bank documents: keep them private.
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..', '..')
const PACK = path.join(ROOT, 'db_export_backup', 'migration_pack')
const OUT = path.join(PACK, 'storage')

const env = {}
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
  }
} catch { /* no .env.local */ }
const url = process.env.SOURCE_SUPABASE_URL || env.VITE_SUPABASE_URL
const key = process.env.SOURCE_SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Need SOURCE_SUPABASE_URL / SOURCE_SUPABASE_KEY, or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
const src = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const inv = JSON.parse(fs.readFileSync(path.join(PACK, 'storage_inventory.json'), 'utf8'))
  console.log(`Downloading ${inv.length} files...`)
  const failures = []
  let done = 0, skipped = 0, bytes = 0, i = 0
  const worker = async () => {
    while (i < inv.length) {
      const o = inv[i++]
      const dest = path.join(OUT, o.bucket_id, ...String(o.name).split('/'))
      try {
        if (fs.existsSync(dest) && o.size != null && fs.statSync(dest).size === Number(o.size)) { skipped++; continue }
        const { data, error } = await src.storage.from(o.bucket_id).download(o.name)
        if (error) throw new Error(error.message || String(error))
        const buf = Buffer.from(await data.arrayBuffer())
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, buf)
        bytes += buf.length
      } catch (e) { failures.push({ bucket: o.bucket_id, name: o.name, error: e.message }) }
      if (++done % 50 === 0) console.log(`  ${done + skipped}/${inv.length}`)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  fs.writeFileSync(path.join(PACK, 'storage_download_failures.json'), JSON.stringify(failures, null, 1))
  console.log(`Done. Downloaded ${done - failures.length}, already on disk ${skipped}, failed ${failures.length}. ${(bytes / 1048576).toFixed(1)} MB written.`)
  if (failures.length) { console.log('See storage_download_failures.json'); process.exitCode = 1 }
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
