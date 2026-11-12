// Writes docs/DATA_MODEL.md from the LIVE database (read-only): every table with its columns, keys,
// relations, indexes, triggers and policies, the values actually in use for the text "enum" columns,
// the database functions and the storage buckets. Regenerate with `npm run migration:docs`.
// Source connection: SOURCE_DB_URL, else SUPABASE_DB_URL from .env.local. Never writes to the database.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..', '..')
let url = process.env.SOURCE_DB_URL
if (!url) { const m = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m); url = m && m[1].trim() }
if (!url) throw new Error('Set SOURCE_DB_URL, or SUPABASE_DB_URL in .env.local')

// What each table is for, in plain words (the database cannot say this itself).
const PURPOSE = {
  team_members: 'Everyone who can sign in: name, email, role, function, and the switches for approving vendors and POs. Login is "type an authorised email", so this table IS the user list.',
  zoho_directory: 'Read-only copy of the employee directory (email, name, role, status), used for pickers and name lookups.',
  approval_delegations: 'Out-of-office cover: an approver names a teammate for a date range.',
  expense_captures: 'The receipt image and payment proof as uploaded, with what OCR read from them (amounts, UPI details), a SHA-256 of the receipt for duplicate detection, and the AI-content flag.',
  expense_details: 'One expense (about 70 columns): amounts, vendor, category, policy results, GST/TDS split, deductions, and links to its capture, report, PO and advances.',
  expense_reports: 'A report: a bundle of expenses submitted for approval and payment, with status, route, net payable, advance applied, vouch and assignment fields.',
  report_expenses: 'Links a report to its expenses (many to many).',
  report_approvals: 'One row per approval level of a report: pending, waiting, approved or rejected.',
  expense_vouch_events: 'Finance line-by-line vouching history: clear, flag, query, reply, reopen. A line status is its latest event.',
  expense_notifications: 'In-app notifications (the bell).',
  advances: 'Money paid to an employee in advance, with its own approval and recorded status.',
  report_advances: 'How much of each advance a report used (a report can draw on several advances and the reverse).',
  tds_rules: 'TDS rules owned by Finance: section, categories, payee type, rates, thresholds.',
  purchase_requests: 'A purchase request: vendor, line items, quotes, budget, donor allocations, advance terms, status.',
  pr_approvals: 'One row per approval level of a PR (Functional Leader, then PR Approver).',
  pr_review_presence: 'Heartbeat so two approvers see that someone else is reviewing the same PR.',
  purchase_orders: 'A PO created from an approved PR, approved and issued by Finance, with its PDF.',
  vendors: 'Vendor master (about 60 columns): organisation, KYC, bank details, document paths, approval status.',
  vendor_invites: 'Public registration links for vendors, with token and expiry.',
  vendor_bank_change_log: 'Requested changes to a vendor bank account (old and new details).',
  approval_rules: 'Configurable report approval routes by amount range (levels, auto-approve, auto-reject).',
  custom_categories: 'Categories that grew out of "Other" automatically (see BUSINESS_RULES.md).',
  activity_log: 'What people did in the tool (approvals, submissions, rule changes). Admin-only to read.',
  system_logs: 'Append-only record of changes to the system itself: schema changes, deployments, team changes, maintenance, downloads. Update, delete and truncate are refused.',
  system_state: 'Key/value settings: the maintenance state, and the auto-category threshold.',
  audit_trail_access_log: 'Who opened the PO audit trail and downloaded its bundle.',
  feedback: 'Legacy table from the removed Share feedback widget. Kept; nothing writes to it.',
}

// Text columns that behave like enums: show the values really in use.
const ENUMS = [
  ['team_members', 'role'], ['team_members', 'function'],
  ['expense_reports', 'status'], ['expense_reports', 'payment_kind'], ['expense_reports', 'advance_choice'],
  ['report_approvals', 'status'], ['report_approvals', 'required_role'],
  ['expense_details', 'status'], ['expense_details', 'policy_status'], ['expense_details', 'payment_method'],
  ['expense_details', 'expense_type'], ['expense_details', 'reimbursement_type'], ['expense_details', 'tds_status'], ['expense_details', 'entity'],
  ['purchase_requests', 'status'], ['purchase_requests', 'expense_type'], ['pr_approvals', 'status'], ['pr_approvals', 'required_role'],
  ['purchase_orders', 'status'], ['vendors', 'status'], ['vendors', 'org_type'], ['vendors', 'source'], ['purchase_requests', 'source'],
  ['advances', 'status'], ['advances', 'advance_type'], ['expense_vouch_events', 'kind'],
  ['expense_notifications', 'type'], ['expense_notifications', 'related_type'],
  ['activity_log', 'entity_type'], ['activity_log', 'action'], ['system_logs', 'category'], ['system_logs', 'action'],
  ['tds_rules', 'payee_type'], ['approval_rules', 'mode'], ['custom_categories', 'source'],
]

const FUNCTION_PURPOSE = {
  next_doc_number: 'Issues PR, PO and VR numbers: one counter per kind per fiscal year (SECURITY DEFINER, advisory lock).',
  enforce_company_card_not_reimbursable: 'Trigger on expense_details: an expense paid on a company card cannot be reimbursable.',
  log_team_member_change: 'Trigger on team_members: writes a System Log row when someone is added, removed or changed.',
  system_logs_refuse: 'Triggers on system_logs: refuse update, delete and truncate.',
  log_ddl_command: 'Event trigger: records every schema change in public into System Logs.',
  log_ddl_drop: 'Event trigger: records every drop in public into System Logs.',
  category_key: 'Normalises text so "Stage hires" and "stage-hire" are the same key (also ignores "and").',
  jsonb_arr: 'Returns a jsonb array, or an empty array if the value is not one.',
  promote_other_category: 'Counts what is typed under Other and creates a category when it is frequent enough.',
  trg_promote_other_expense: 'Trigger on expense_details: calls promote_other_category.',
  trg_promote_other_pr: 'Trigger on purchase_requests: calls promote_other_category for PR line items.',
}

const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const code = s => '`' + String(s ?? '').replace(/`/g, "'") + '`'

async function main() {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query('SET default_transaction_read_only = on')
  const q = async (s, p) => (await c.query(s, p)).rows
  const out = []
  const w = (...l) => out.push(...l)

  const tables = await q(`select c.oid, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by c.relname`)
  const stamp = new Date().toISOString().slice(0, 10)
  w('# Data model', '',
    `Generated from the live database on ${stamp} by \`npm run migration:docs\`. Do not edit by hand: regenerate.`,
    'The exact, replayable schema is `docs/database/schema.sql`. This file explains it.', '',
    `${tables.length} tables in the \`public\` schema, plus Supabase Storage. Row counts are a snapshot, not a rule.`, '',
    '## Conventions', '',
    '- "Enums" are plain text columns, not database enum types. The values really in use are listed under each table and in the last section.',
    '- Multi-value fields (attendees, line items, quotes, donor allocations, policy flags, the TDS split) are `jsonb` or text arrays on the row.',
    '- Money is `numeric`. Dates are `timestamptz` unless noted. Primary keys are `uuid` unless noted.',
    '- Row-level security is enabled on most tables but the policies are `USING (true)`: the app talks to the database straight from the browser with the anon key. See `SECURITY_AND_KNOWN_GAPS` in START_HERE.md.', '',
    '## Tables', '')

  // index
  w('| Table | Rows | What it is |', '|---|---|---|')
  const counts = {}
  for (const t of tables) counts[t.relname] = (await q(`select count(*)::int n from public."${t.relname}"`))[0].n
  for (const t of tables) w(`| [${t.relname}](#${t.relname}) | ${counts[t.relname]} | ${esc(PURPOSE[t.relname] || '')} |`)
  w('')

  for (const t of tables) {
    w(`### ${t.relname}`, '', PURPOSE[t.relname] || '', '')
    const cols = await q(`
      select a.attname, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull, a.attidentity, pg_get_expr(d.adbin, d.adrelid) def
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped order by a.attnum`, [t.oid])
    w(`${cols.length} columns.`, '', '| Column | Type | Null | Default |', '|---|---|---|---|')
    for (const a of cols) {
      const def = a.attidentity ? `identity (${a.attidentity === 'a' ? 'always' : 'by default'})` : (a.def ?? '')
      w(`| ${code(a.attname)} | ${esc(a.typ)} | ${a.attnotnull ? 'no' : 'yes'} | ${def ? code(def) : ''} |`)
    }
    w('')
    const cons = await q(`select conname, contype, pg_get_constraintdef(oid) d from pg_constraint where conrelid = $1 order by (contype = 'p') desc, (contype = 'u') desc, conname`, [t.oid])
    if (cons.length) {
      const label = { p: 'Primary key', u: 'Unique', f: 'Foreign key', c: 'Check', x: 'Exclusion' }
      w('Keys and constraints:', '')
      for (const k of cons) w(`- ${label[k.contype] || k.contype}: ${code(k.d)}`)
      w('')
    }
    const idx = await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = $1 and indexname not in (select conname from pg_constraint where conrelid = $2)`, [t.relname, t.oid])
    if (idx.length) { w('Indexes:', ''); for (const i of idx) w(`- ${code(i.indexdef)}`); w('') }
    const trg = await q(`select tgname, pg_get_triggerdef(oid, true) d from pg_trigger where tgrelid = $1 and not tgisinternal`, [t.oid])
    if (trg.length) { w('Triggers:', ''); for (const g of trg) w(`- ${code(g.d)}`); w('') }
    const pol = await q(`select p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) qual from pg_policy p where p.polrelid = $1`, [t.oid])
    w(`Row-level security: ${t.relrowsecurity ? 'enabled' : 'off'}.${pol.length ? ' Policies: ' + pol.map(p => `${code(p.polname)} (${({ r: 'select', a: 'insert', w: 'update', d: 'delete', '*': 'all' })[p.polcmd]}, using ${code(p.qual || 'true')})`).join('; ') + '.' : ''}`, '')
    const en = ENUMS.filter(([tb]) => tb === t.relname)
    if (en.length) {
      w('Values in use:', '')
      for (const [, col] of en) {
        try {
          const vals = await q(`select coalesce("${col}"::text, '(null)') v, count(*)::int n from public."${t.relname}" group by 1 order by 2 desc limit 25`)
          w(`- ${code(col)}: ${vals.map(v => `${code(v.v)} (${v.n})`).join(', ')}`)
        } catch { /* column not present */ }
      }
      w('')
    }
  }

  w('## Database functions and triggers', '')
  const fns = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1`)
  for (const f of fns) w(`- ${code(f.proname + '()')}: ${FUNCTION_PURPOSE[f.proname] || ''}`)
  w('', 'Full bodies are in `docs/database/schema.sql`. Event triggers (`system_log_ddl`, `system_log_drop`) are in `docs/database/event_triggers.sql` and must be applied last, after the data load.', '')

  w('## Document numbering', '',
    'PR, PO and vendor registration numbers look like `26/27-PR-07-0053`: fiscal year, kind (`PR`, `PO`, `VR`), a fixed `07` segment, a 4-digit counter. `next_doc_number(kind, fy_prefix)` creates one sequence per kind per fiscal year on first use (`doc_seq_pr_26_27` and so on), seeded from the rows already numbered that year, and is safe under concurrent use. Report references are `TNIE<yy>####` (employee reimbursement) and `TNIV<yy>####` (vendor invoice against a PO), generated in the browser.', '')

  w('## Storage buckets', '', 'All private; files are opened through signed URLs. The database stores the paths, so paths must not change in a move.', '')
  const buckets = await q(`select id, public from storage.buckets order by id`)
  const objs = await q(`select bucket_id, count(*)::int files, coalesce(sum((metadata->>'size')::bigint),0)::bigint bytes from storage.objects group by 1`)
  const by = Object.fromEntries(objs.map(o => [o.bucket_id, o]))
  w('| Bucket | Public | Files | Size | Used for |', '|---|---|---|---|---|')
  const USED = { 'expense-documents': 'Receipts, payment proofs, supporting attachments', 'vendor-documents': 'PAN, cheque, GST, MSME, registration, Aadhaar documents', 'pr-quotes': 'Quotes, comparative statements, advance approval screenshots', 'po-pdfs': 'Generated PO PDFs', 'feedback-screenshots': 'Legacy, unused' }
  for (const b of buckets) w(`| ${b.id} | ${b.public ? 'yes' : 'no'} | ${by[b.id]?.files || 0} | ${((Number(by[b.id]?.bytes || 0)) / 1048576).toFixed(1)} MB | ${USED[b.id] || ''} |`)
  w('', 'The code also refers to an `expense-reports` bucket (report PDFs) that has never existed on the live project, so those uploads fail quietly and report PDFs are generated on the fly. See `scripts/migration/inventory.json`, `known_gaps`.', '')

  w('## Where each text "enum" is defined in code', '',
    '| Value list | File |', '|---|---|',
    '| Roles | `src/lib/auth.js` (`ROLES`) |', '| Expense categories | `src/lib/expenseCategories.js`, `src/lib/prConstants.js`, and `custom_categories` |',
    '| Stages and statuses | the components that set them; see WORKFLOWS.md |', '| Entities, programmes, sub-programmes, donors | `src/lib/donorData.js` (generated from the mapping sheet) |',
    '| Functions (PR routing) | `src/lib/functionRouting.js` |', '| Expense natures | `src/lib/donorData.js` (`EXPENSE_NATURES`) |')

  const file = path.join(ROOT, 'docs', 'DATA_MODEL.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, out.join('\n') + '\n')
  console.log(`Wrote docs/DATA_MODEL.md (${tables.length} tables, ${fns.length} functions).`)
  await c.end()
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
