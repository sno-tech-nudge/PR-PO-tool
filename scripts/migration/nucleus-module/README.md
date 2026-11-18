# Expenses module: ported logic (`src/modules/expenses/lib`)

This folder holds the **business rules** of the Nudge expense / PR / PO / vendor / advance tool, ported from the tool's `src/lib`.
The rules encode Finance policy (limits, TDS, approval routing, duplicate checks, document numbering). They must behave exactly like the original.

## Rules for everyone, including Lovable

1. **Do not edit any file in this folder.** Not to fix a type, not to "clean up", not to match a style. `parity.test.mjs` fails if a ported file changes.
2. **Build screens that import from here.** A screen calls these functions; it does not reimplement them.
   Example: `import { runAllChecks } from "@/modules/expenses/lib/policyEngine"`.
3. **Need a different behaviour?** Do not change the file. Say what is needed; the change is made in the original tool's rules first, then re-ported, then the parity vectors are updated.
4. **Tables already exist.** Do not create, rename or alter the module's tables (`docs/database/nucleus_schema.sql` in the tool repository defines them).

## What is here

| | |
|---|---|
| `*.ts` (about 70 files) | The original `src/lib/*.js`, one for one. The code is unchanged. Every file starts with a header saying where it came from |
| `seams.ts` | **Written for Nucleus.** Sends the old `/api/send-email`, `/api/notify-slack`, `/api/ai/proxy` calls to Supabase Edge Functions of the same purpose (`send-email`, `notify-slack`, `ai-proxy`) |
| `supabase.ts` | **Written for Nucleus.** Re-exports Nucleus's shared Supabase client, so the signed-in user's session and the row-level security rules apply |
| `auth.ts` | The original permission helpers (`canAccessFinance`, `canApprovePO`, ...) **plus** a Nucleus sign-in lookup: the signed-in Nucleus email is matched to `team_members` to get the person's role. The type-an-email login is removed |
| `parity_vectors.json`, `parity.test.mjs` | 50 test cases from the original tool and the test that runs them (`node --test src/modules/expenses/lib/parity.test.mjs`) |
| `PORT_MANIFEST.json` | A fingerprint of every file as ported, and of its original. Used by the test to detect edits |

## What changed from the original, and nothing else

1. A header on each file (`eslint-disable`, `@ts-nocheck`, source note).
2. Relative imports have an explicit `.ts` extension (`./gemini.js` is now `./gemini.ts`).
3. `await fetch('/api/...` is now `await apiFetch('/api/...` (see `seams.ts`).
4. `auth.ts`: the sign-in block is replaced as described above.

The port script proves this: it compares every file with its original line by line and stops if any other line differs.

## What the test covers, and what it does not

The 50 cases cover the **pure rules**: policy limits (hotel, food, per-km, late claim, large claim), approval route by total, advance notice,
GSTIN check digit, and TDS (single-bill and yearly limits, catch-up, no PAN, payee type, per-line split).
The files that read and write the database (approvals, vouching, reimbursement, numbering, notifications) are **not** covered by these cases;
they are proven by the parity checklist (`docs/PARITY_CHECKLIST.md` in the tool repository) once the screens exist.

## Known gaps (to be done, not forgotten)

- **Types.** The files are `.ts` but carry `@ts-nocheck` so the logic stays byte-for-byte. Real types can be added later, in a separate reviewed change, with the parity test as the safety net.
- **The three Edge Functions do not exist yet** (`send-email`, `notify-slack`, `ai-proxy`). Until they do, OCR and AI hints fail quietly (the user types instead), and no email or Slack message is sent. Which mail service Nucleus uses is still to be decided.
- **Extra packages.** Some files need `jszip` and `pdf-lib`, which Nucleus does not have yet (`jspdf`, `html2canvas`, `pdfjs-dist`, `react` it does). They are only needed once a screen imports the PDF and export files (`pdfMerge`, `pdfGenerator`, `poBundle`, `auditPack`, `auditTrail`, `vendorProfilePdf`, `expenseAttachmentsPdf`). Add them when that screen is built.
- **Deep links.** `slack.ts` `recordUrl()` builds a `?type=pr&id=...` link for the old single-page app. Nucleus's routes will need their own link format.
- **`categories.ts`** is a React hook that reads the module's category tables.
- **Translations** (`src/lib/i18n`) were not ported; they are UI.

## Updating from the original tool

While the old tool is still live, its rules can still change. Re-port from the tool repository:

```bash
node scripts/migration/port-to-nucleus.mjs --nucleus <path to this repository>
node --test src/modules/expenses/lib/parity.test.mjs
```

The script refuses to overwrite a file that was edited here (use `--force` only after reviewing the edit). Review the diff in a pull request; it should be small and explainable.
