// Rewrites the generated part of src/lib/donorData.js from the mapping sheet (CSV).
//   node scripts/gen-donor-map.cjs "C:/path/to/PRPO module - mapping - mapping.csv"
// Columns: (blank), Entity, Program, Sub-program, Location, Donor. Location is not a field in the
// forms; it is looked up from the donor and shown to approvers next to the sub-program.
const fs = require('fs')
const path = require('path')

const csvPath = process.argv[2]
if (!csvPath) { console.error('Usage: node scripts/gen-donor-map.cjs <mapping.csv>'); process.exit(1) }
const target = path.resolve(__dirname, '..', 'src', 'lib', 'donorData.js')

// Typos in the sheet that would otherwise show up on screen as written.
const FIXES = { 'Arunchal Pradesh': 'Arunachal Pradesh' }
const clean = s => { const v = String(s || '').replace(/\s+/g, ' ').trim(); return FIXES[v] || v }

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false; else cell += ch }
    else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
const header = rows.findIndex(r => r.some(c => clean(c).toLowerCase() === 'entity'))
if (header < 0) throw new Error('No header row with "Entity" found')
const col = name => rows[header].findIndex(c => clean(c).toLowerCase() === name)
const [iE, iP, iS, iL, iD] = ['entity', 'program', 'sub-program', 'location', 'donor'].map(col)
if ([iE, iP, iS, iL, iD].some(i => i < 0)) throw new Error('Expected columns: Entity, Program, Sub-program, Location, Donor')

const map = {}
const locations = {}
for (const r of rows.slice(header + 1)) {
  const [entity, program, sub, loc, donor] = [iE, iP, iS, iL, iD].map(i => clean(r[i]))
  if (!entity || !program || !sub || !donor) continue
  const donors = ((map[entity] ??= {})[program] ??= {})[sub] ??= []
  if (!donors.includes(donor)) donors.push(donor)
  if (loc) { const k = [entity, program, sub, donor].join('|'); const arr = (locations[k] ??= []); if (!arr.includes(loc)) arr.push(loc) }
}

const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
let out = '// <generated:donor-map> Written by scripts/gen-donor-map.cjs from the mapping sheet. Do not edit by hand.\n'
out += 'const MAPPED = {\n'
for (const [e, progs] of Object.entries(map)) {
  out += `  ${q(e)}: {\n`
  for (const [p, subs] of Object.entries(progs)) {
    out += `    ${q(p)}: {\n`
    for (const [s, donors] of Object.entries(subs)) out += `      ${q(s)}: [${donors.map(q).join(', ')}],\n`
    out += '    },\n'
  }
  out += '  },\n'
}
out += '}\n\n'
out += '// "entity|program|sub-programme|donor" -> where that donor funds the work. More than one place means the donor alone does not say.\n'
out += 'const LOCATIONS = {\n'
for (const [k, v] of Object.entries(locations)) out += `  ${q(k)}: [${v.map(q).join(', ')}],\n`
out += '}\n// </generated:donor-map>'

const src = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
const re = /\/\/ <generated:donor-map>[\s\S]*?\/\/ <\/generated:donor-map>/
if (!re.test(src)) throw new Error('Markers not found in donorData.js')
fs.writeFileSync(target, src.replace(re, () => out))

const nDonors = Object.values(map).flatMap(p => Object.values(p)).flatMap(s => Object.values(s)).flat().length
const ambiguous = Object.entries(locations).filter(([, v]) => v.length > 1)
console.log(`Entities ${Object.keys(map).length}, donors ${nDonors}, locations known for ${Object.keys(locations).length - ambiguous.length} donor rows.`)
for (const [k, v] of ambiguous) console.log(`  Several locations, none shown: ${k} -> ${v.join(', ')}`)
