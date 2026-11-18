# Expenses module: specification

These documents describe the Nudge expense / PR / PO / vendor / advance tool that is being rebuilt as a native module of Nucleus.
They are copied here from the original tool's repository so that the people and tools building the module can read them in this repository.
They contain no secrets and no personal data.

**The rules themselves are code, not prose:** `src/modules/expenses/lib/` (do not edit; see its README). Where a document and that code disagree, the code is right: say so instead of "fixing" either.

## Read in this order

1. `WORKFLOWS.md`: the life of every record (expense, report, PR, PO, vendor, advance), who is told what.
2. `BUSINESS_RULES.md`: every limit, threshold and special case.
3. `ROLES_AND_PERMISSIONS.md`: who can do what, including deliberate restrictions.
4. `DATA_MODEL.md`: the 27 tables, what each column means, the text values in use.
5. `AI_AND_OCR.md` and `AI_PROMPTS.md`: how receipts and documents are read; the exact prompts (use them verbatim).
6. `PARITY_CHECKLIST.md`: how to prove each screen behaves like the original.
7. `INTEGRATIONS_AND_API.md`: what the old server routes did (for the three Edge Functions still to be written).
8. `BUILD_INTO_NUCLEUS.md`: decisions already made for this build. Do not re-ask them.

`database/nucleus_schema.sql` is the table definition, written for Nucleus. **Do not copy it into `supabase/migrations/` and do not run it from a prompt.** It is applied once, deliberately, by the owner, after a clash check.
`data/` holds the Finance mapping sheet (entity, programme, sub-programme, location, donor).

## What is different in Nucleus from what the documents say

The documents describe the original tool. In Nucleus:

| The documents say | In Nucleus |
|---|---|
| Sign in by typing an email; role from `team_members` | Google sign-in through Nucleus; the signed-in email is matched to `team_members` for the module role (`auth.ts` in the lib folder does this) |
| Vercel routes `/api/send-email`, `/api/notify-slack`, `/api/ai/proxy` | Supabase Edge Functions `send-email`, `notify-slack`, `ai-proxy` (not written yet; call them only through `seams.ts`) |
| Email through Resend | Nucleus's own mail (to be confirmed; do not add Resend) |
| Screens in inline-styled React with an `appScreen` switch | Nucleus components, design tokens and TanStack file routes under `/expenses`, registered in `src/lib/nav-items.ts` |
| Daily reminder cron on Vercel | Supabase Cron (later) |

Everything else (rules, states, numbers, wording of policy messages, approval levels, document numbering) is to be reproduced exactly.
