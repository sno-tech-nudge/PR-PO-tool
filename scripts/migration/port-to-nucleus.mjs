// Ports the tool's logic (src/lib/*.js) into a Nucleus checkout as TypeScript files, with ONLY mechanical changes, and proves it.
//   node scripts/migration/port-to-nucleus.mjs --nucleus <path to a Nucleus checkout or worktree> [--force]
// Writes <nucleus>/src/modules/expenses/lib/ :
//   - one .ts file per src/lib/*.js, logic unchanged (see "what changes" below)
//   - seams.ts, supabase.ts, parity.test.mjs, README.md (hand-written, from scripts/migration/nucleus-module/)
//   - parity_vectors.json (copied from docs/data/) and PORT_MANIFEST.json (hashes of every file, original and ported)
// What changes in a ported file, and nothing else:
//   1. a header (eslint-disable, @ts-nocheck, where it came from);
//   2. relative imports get an explicit .ts extension (Nucleus's convention; './gemini.js' becomes './gemini.ts');
//   3. `await fetch('/api/...` becomes `await apiFetch('/api/...` (seams.ts sends it to a Nucleus Edge Function), plus one import line;
//   4. auth.js only: the type-an-email sign-in is replaced by a lookup of the signed-in Nucleus user in team_members.
//   5. vendorMatch.js only: the vendors-table read becomes the database function exp_vendor_directory() (vendor bank/PAN/Aadhaar are Finance-only in Nucleus).
// supabase.js is replaced by supabase.ts (the shared Nucleus client). src/lib/i18n is not ported (it is UI).
// The script compares every ported file with its original line by line and stops if anything else differs.
// Re-run it whenever the old tool's logic changes before cutover. It refuses to overwrite files edited in Nucleus unless --force.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..')
const args = process.argv.slice(2)
const force = args.includes('--force')
const at = args.indexOf('--nucleus')
const NUC = at >= 0 ? args[at + 1] : process.env.NUCLEUS_DIR
if (!NUC) throw new Error('Give the Nucleus checkout: --nucleus <path>')
if (!fs.existsSync(path.join(NUC, 'src', 'integrations', 'supabase', 'client.ts'))) throw new Error(`${NUC} does not look like the Nucleus repository (no src/integrations/supabase/client.ts)`)

const SRC = path.join(ROOT, 'src', 'lib')
const OUT = path.join(NUC, 'src', 'modules', 'expenses', 'lib')
const sha = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
const lf = text => text.replace(/\r\n/g, '\n')

// ---- refuse to overwrite deliberate edits ----
const manifestPath = path.join(OUT, 'PORT_MANIFEST.json')
if (fs.existsSync(manifestPath) && !force) {
  const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const edited = old.files.filter(f => fs.existsSync(path.join(OUT, f.ported)) && sha(fs.readFileSync(path.join(OUT, f.ported), 'utf8')) !== f.portedSha256).map(f => f.ported)
  if (edited.length) throw new Error(`These ported files were edited in Nucleus, so I will not overwrite them: ${edited.join(', ')}. Review the edits, or run with --force.`)
}

const importRe = /(from\s+)(['"])\.\/([A-Za-z0-9_-]+)(?:\.js)?\2/g
const fetchRe = /await fetch\('\/api\//g

const header = (file, srcSha, adapted) => [
  '/* eslint-disable */',
  '// @ts-nocheck',
  `// PORTED from the PR-PO tool: src/lib/${file}.js (source sha256 ${srcSha.slice(0, 12)}).`,
  adapted
    ? '// ADAPTED for Nucleus: see the marked block below. Everything else is unchanged.'
    : '// The logic is unchanged. Only import paths (explicit .ts) and the server-route seam (apiFetch) were adjusted.',
  '// Do not edit by hand: see ./README.md and PORT_MANIFEST.json.',
].join('\n') + '\n'

function adaptAuth(t) {
  const startMark = 'export async function signIn('
  const endMark = 'export async function getFinanceEmails'
  const a = t.indexOf(startMark), b = t.indexOf(endMark)
  if (a < 0 || b < 0 || b < a) throw new Error('auth.js changed shape: cannot find signIn/getFinanceEmails markers. Update port-to-nucleus.mjs.')
  const replacement = [
    '// ===== ADAPTED FOR NUCLEUS (start) =====',
    '// The old tool signed people in by typing an email and kept it in localStorage. Nucleus signs people in with Google',
    '// (Supabase Auth). Here the signed-in Nucleus email is looked up in team_members to get the person\'s role in this module.',
    '// signIn() is removed on purpose. Someone signed in to Nucleus with no team_members row simply has no role here.',
    'export async function signOut() {',
    '  await supabase.auth.signOut()',
    '}',
    '',
    'export async function getSession() {',
    '  const { data } = await supabase.auth.getUser()',
    '  const email = data?.user?.email',
    '  if (!email) return null',
    '  const row = await lookupMember(email)',
    '  return row ? buildUser(row) : null',
    '}',
    '// ===== ADAPTED FOR NUCLEUS (end) =====',
    '',
    '',
  ].join('\n')
  let out = t.slice(0, a) + replacement + t.slice(b)
  const keyLine = "const SESSION_KEY = 'nudge_user_email'\n"
  if (!out.includes(keyLine)) throw new Error('auth.js changed shape: SESSION_KEY line not found')
  return out.replace(keyLine, '')
}

function adaptVendorMatch(t) {
  const oldRead = ".from('vendors')\n      .select('id, vendor_id, org_name, gstin, pan_number, status')\n"
  const anchor = 'export function loadVendorRegistry('
  if (!t.includes(oldRead) || !t.includes(anchor)) throw new Error('vendorMatch.js changed shape: cannot find the vendors read. Update port-to-nucleus.mjs.')
  const note = [
    '// ===== ADAPTED FOR NUCLEUS (start) =====',
    '// In Nucleus, vendor bank, PAN and Aadhaar details are Finance-only at the database level, so reading the vendors table',
    '// directly returns only the vendors the signed-in person submitted. The approved-vendor list is read through the database',
    '// function exp_vendor_directory() instead. It returns id, vendor_id, org_name, org_type, status, gstin, city, state,',
    '// nature_of_business, submitted_by, submitted_at, approved_at, and no pan_number (matchVendor does not use it).',
    '// Anything that needs a vendor\'s PAN (for example the TDS check) must read it separately, as a Finance user.',
    '// ===== ADAPTED FOR NUCLEUS (end) =====',
    '',
  ].join('\n')
  return t.replace(oldRead, ".rpc('exp_vendor_directory')\n").replace(anchor, note + anchor)
}

fs.mkdirSync(OUT, { recursive: true })
const files = []
const skipped = []
const report = []

for (const name of fs.readdirSync(SRC).sort()) {
  const full = path.join(SRC, name)
  if (!fs.statSync(full).isFile() || !name.endsWith('.js')) { if (fs.statSync(full).isDirectory()) skipped.push(`${name}/ (UI, not ported)`); continue }
  const base = name.replace(/\.js$/, '')
  if (base === 'supabase') { skipped.push('supabase.js (replaced by supabase.ts, the shared Nucleus client)'); continue }

  const original = lf(fs.readFileSync(full, 'utf8'))
  const origSha = sha(original)
  let body = original.replace(importRe, '$1$2./$3.ts$2')
  const usesSeam = fetchRe.test(body); fetchRe.lastIndex = 0
  if (usesSeam) body = body.replace(fetchRe, "await apiFetch('/api/")
  const adapted = base === 'auth' || base === 'vendorMatch'
  if (base === 'auth') body = adaptAuth(body)
  if (base === 'vendorMatch') body = adaptVendorMatch(body)
  const seamImport = usesSeam ? "import { apiFetch } from './seams.ts'\n" : ''
  const ported = header(base, origSha, adapted) + seamImport + body

  // ---- prove only the allowed lines differ ----
  if (!adapted) {
    const h = header(base, origSha, adapted).split('\n').length - 1 + (usesSeam ? 1 : 0)
    const pl = ported.split('\n').slice(h), ol = original.split('\n')
    if (pl.length !== ol.length) throw new Error(`${name}: line count changed unexpectedly`)
    let changed = 0
    for (let i = 0; i < ol.length; i++) {
      if (pl[i] === ol[i]) continue
      if (!/from\s+['"]\.\//.test(ol[i]) && !/await fetch\('\/api\//.test(ol[i])) throw new Error(`${name}:${i + 1} differs in a way that is not allowed:\n  was: ${ol[i]}\n  now: ${pl[i]}`)
      changed++
    }
    report.push(`${base}.ts: ${changed} line(s) adjusted${usesSeam ? ' (+ apiFetch import)' : ''}`)
  } else report.push(base === 'auth' ? 'auth.ts: ADAPTED (sign-in replaced by a Nucleus lookup)' : 'vendorMatch.ts: ADAPTED (vendor list read through exp_vendor_directory())')

  fs.writeFileSync(path.join(OUT, `${base}.ts`), ported)
  files.push({ ported: `${base}.ts`, source: `src/lib/${name}`, sourceSha256: origSha, portedSha256: sha(ported), kind: adapted ? 'adapted' : usesSeam ? 'verbatim+seam' : 'verbatim' })
}

// ---- hand-written Nucleus-side files and data ----
const extras = [
  ['seams.ts', path.join(here, 'nucleus-module', 'seams.ts')],
  ['supabase.ts', path.join(here, 'nucleus-module', 'supabase.ts')],
  ['parity.test.mjs', path.join(here, 'nucleus-module', 'parity.test.mjs')],
  ['README.md', path.join(here, 'nucleus-module', 'README.md')],
  ['parity_vectors.json', path.join(ROOT, 'docs', 'data', 'parity_vectors.json')],
]
for (const [name, from] of extras) {
  const text = lf(fs.readFileSync(from, 'utf8'))
  fs.writeFileSync(path.join(OUT, name), text)
  if (name !== 'README.md') files.push({ ported: name, source: path.relative(ROOT, from).split(path.sep).join('/'), sourceSha256: sha(text), portedSha256: sha(text), kind: 'handwritten' })
}

// ---- the specification, so whoever builds the screens can read it inside the Nucleus repository ----
const SPEC = path.join(NUC, 'docs', 'expenses-spec')
const specFiles = [
  ['docs/WORKFLOWS.md', 'WORKFLOWS.md'], ['docs/BUSINESS_RULES.md', 'BUSINESS_RULES.md'], ['docs/ROLES_AND_PERMISSIONS.md', 'ROLES_AND_PERMISSIONS.md'],
  ['docs/DATA_MODEL.md', 'DATA_MODEL.md'], ['docs/AI_AND_OCR.md', 'AI_AND_OCR.md'], ['docs/AI_PROMPTS.md', 'AI_PROMPTS.md'],
  ['docs/PARITY_CHECKLIST.md', 'PARITY_CHECKLIST.md'], ['docs/INTEGRATIONS_AND_API.md', 'INTEGRATIONS_AND_API.md'], ['docs/BUILD_INTO_NUCLEUS.md', 'BUILD_INTO_NUCLEUS.md'],
  ['docs/database/nucleus_schema.sql', 'database/nucleus_schema.sql'], ['docs/data/PRPO mapping - mapping.csv', 'data/PRPO mapping - mapping.csv'],
  ['scripts/migration/nucleus-module/SPEC_README.md', 'README.md'],
]
for (const [from, to] of specFiles) {
  const dest = path.join(SPEC, to)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, lf(fs.readFileSync(path.join(ROOT, from), 'utf8')))
}

let toolCommit = null, toolDirty = null
try {
  toolCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim()
  toolDirty = execFileSync('git', ['status', '--porcelain', '--', 'src/lib'], { cwd: ROOT }).toString().trim().length > 0
} catch { /* not a git checkout */ }
fs.writeFileSync(manifestPath, JSON.stringify({
  _about: 'Hashes (line-ending neutral) of every file in this folder, as ported. parity.test.mjs fails if a ported file no longer matches, so rules cannot drift silently.',
  generatedBy: 'scripts/migration/port-to-nucleus.mjs in the PR-PO tool repository',
  toolCommit, toolHadUncommittedLogicChanges: toolDirty, generatedOn: new Date().toISOString().slice(0, 10),
  notPorted: skipped, files,
}, null, 2) + '\n')

console.log(`Specification copied to ${path.relative(process.cwd(), SPEC) || SPEC} (${specFiles.length} files)`)
console.log(report.join('\n'))
console.log(`\nPorted ${files.filter(f => f.kind !== 'handwritten').length} logic files + ${files.filter(f => f.kind === 'handwritten').length} hand-written files into ${path.relative(process.cwd(), OUT) || OUT}`)
for (const s of skipped) console.log(`Not ported: ${s}`)
if (toolDirty) console.log('NOTE: src/lib in the tool repository has uncommitted changes; the manifest records that.')
