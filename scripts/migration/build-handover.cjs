// Builds the handover packages for rebuilding or migrating this tool, into db_export_backup/handover/ (gitignored).
//   npm run handover                 refresh the export and docs, then build both zips (storage files included if downloaded)
//   npm run handover -- --skip-export   reuse the export already on disk
//   npm run handover -- --with-storage  also download the storage files first (~160 MB, takes a few minutes)
//
// Two zips, on purpose:
//   1. nudge-tool_CODE_AND_DOCS_<date>.zip   the whole repository as it is on disk (tracked and untracked files, nothing
//      ignored) plus docs/database. Safe to share: it is scanned for secrets and holds no personal data.
//   2. nudge-tool_DATA_PRIVATE_<date>.zip    the real data: every row of the database and every stored file. This holds
//      vendor bank details, PAN and Aadhaar numbers and employee records. Share it only with someone who may see them.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync, execFileSync } = require('child_process')
const JSZip = require('jszip')

const ROOT = path.resolve(__dirname, '..', '..')
const PACK = path.join(ROOT, 'db_export_backup', 'migration_pack')
const OUT = path.join(ROOT, 'db_export_backup', 'handover')
const args = process.argv.slice(2)
const skipExport = args.includes('--skip-export')
const withStorage = args.includes('--with-storage')
const date = new Date().toISOString().slice(0, 10)

function run(script, extra = []) {
  console.log(`> ${script}`)
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...extra], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${script} failed`)
}

async function writeZip(zip, file) {
  await new Promise((resolve, reject) => {
    zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } })
      .pipe(fs.createWriteStream(file)).on('finish', resolve).on('error', reject)
  })
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  return { size: fs.statSync(file).size, sha }
}
const mb = n => `${(n / 1048576).toFixed(1)} MB`

// What a leaked secret looks like. Placeholders such as <password> are fine.
const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/gsk_[A-Za-z0-9]{20,}/, 'Groq key'],
  [/\bre_[A-Za-z0-9]{20,}/, 'Resend key'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, 'a JWT (Supabase key or session token)'],
  [/postgres(?:ql)?:\/\/[^\s:@<]+:[^\s@<>]{6,}@[^\s]+/, 'a database connection string with a password'],
  [/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/, 'a Slack webhook URL'],
  [/xox[abp]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
]
const TEXT_EXT = /\.(js|cjs|mjs|jsx|ts|tsx|json|md|txt|sql|css|html|yml|yaml|env|example|csv|toml)$/i

async function main() {
  run('gen-ai-prompts.cjs') // reads source only, always cheap, keeps docs/AI_PROMPTS.md identical to the live prompts
  run('gen-parity-vectors.mjs') // runs the real rule functions on fixed inputs, keeps docs/data/parity_vectors.json current
  if (!skipExport) { run('export-db.cjs'); run('gen-data-model-doc.cjs') }
  if (!fs.existsSync(path.join(PACK, '01_schema.sql'))) throw new Error('No export found. Run without --skip-export first.')
  if (withStorage) run('download-storage.cjs')

  // 1. The parts of the database export that hold no data, kept in the repository so the schema travels with the code.
  const dbDocs = path.join(ROOT, 'docs', 'database')
  fs.mkdirSync(dbDocs, { recursive: true })
  for (const [from, to] of [['01_schema.sql', 'schema.sql'], ['03_sequences_setval.sql', 'sequences_setval.sql'], ['04_event_triggers.sql', 'event_triggers.sql'], ['summary.json', 'summary.json']]) {
    fs.copyFileSync(path.join(PACK, from), path.join(dbDocs, to))
  }
  console.log('Updated docs/database/ (schema, sequences, event triggers, summary).')

  fs.mkdirSync(OUT, { recursive: true })

  // 2. Code and docs: every file git knows about or would add, minus anything ignored (.env*, node_modules, dist, db_export_backup).
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean)
  const files = listed.filter(f => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile())
  const problems = []
  for (const f of files) {
    if (/(^|\/)(\.env(\..*)?|\.vercel|node_modules|db_export_backup)(\/|$)/.test(f) && f !== '.env.example') problems.push(`${f}: should not be packaged`)
    if (TEXT_EXT.test(f) && fs.statSync(path.join(ROOT, f)).size < 5 * 1024 * 1024) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) problems.push(`${f}: looks like ${what}`)
    }
  }
  if (problems.length) { console.error('\nRefusing to build: possible secrets or private files in the code package:\n - ' + problems.join('\n - ')); process.exit(1) }

  const codeZip = new JSZip()
  for (const f of files) codeZip.file(`nudge-expense-tool/${f}`, fs.createReadStream(path.join(ROOT, f)), { binary: true })
  const codeFile = path.join(OUT, `nudge-tool_CODE_AND_DOCS_${date}.zip`)
  const code = await writeZip(codeZip, codeFile)
  console.log(`\nCode and docs: ${path.basename(codeFile)}  ${files.length} files  ${mb(code.size)}`)

  // 3. Private data: all rows and all stored files.
  const privZip = new JSZip()
  const base = 'nudge-expense-tool-data'
  privZip.file(`${base}/PRIVATE_READ_ME_FIRST.txt`, [
    'PRIVATE DATA. Share only with someone who is allowed to see it.',
    '',
    'This holds real vendor bank details, PAN and Aadhaar numbers, employee records and receipts.',
    '',
    'What is here',
    '  01_schema.sql               the database structure (same as docs/database/schema.sql in the code package)',
    '  02_data.sql                 every row of the database, as INSERT statements (run AFTER the schema)',
    '  03_sequences_setval.sql     sets the number counters back to where they were (run after the data)',
    '  04_event_triggers.sql       the two system-log event triggers (run last)',
    '  storage_inventory.json      list of every stored file: bucket, path, size, type',
    '  storage/<bucket>/<path>     the files themselves, with the exact paths the database refers to',
    '  summary.json                row counts per table, for checking a load',
    '',
    'How to load it: unzip this folder INTO db_export_backup/migration_pack/ of the code package, then follow docs/MIGRATION_RUNBOOK.md',
    '(apply-db.cjs loads the four SQL files; upload-storage.cjs puts storage/ into the new project).',
    `Built on ${date}. Data is a snapshot: re-run \`npm run handover\` right before the real move.`,
  ].join('\n'))
  for (const f of ['01_schema.sql', '02_data.sql', '03_sequences_setval.sql', '04_event_triggers.sql', 'storage_inventory.json', 'summary.json']) {
    privZip.file(`${base}/${f}`, fs.createReadStream(path.join(PACK, f)), { binary: true })
  }
  let storageFiles = 0
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else { privZip.file(`${base}/storage/${path.relative(path.join(PACK, 'storage'), p).split(path.sep).join('/')}`, fs.createReadStream(p), { binary: true }); storageFiles++ } } }
  if (fs.existsSync(path.join(PACK, 'storage'))) walk(path.join(PACK, 'storage'))
  const privFile = path.join(OUT, `nudge-tool_DATA_PRIVATE_${date}.zip`)
  const priv = await writeZip(privZip, privFile)
  console.log(`Private data:  ${path.basename(privFile)}  ${storageFiles} stored files  ${mb(priv.size)}`)
  if (!storageFiles) console.log('  (no storage files on disk: run with --with-storage to include them)')

  fs.writeFileSync(path.join(OUT, `SHA256_${date}.txt`), `${code.sha}  ${path.basename(codeFile)}\n${priv.sha}  ${path.basename(privFile)}\n`)
  console.log(`\nWritten to ${OUT}\nSHA-256 of both zips is in SHA256_${date}.txt`)
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
