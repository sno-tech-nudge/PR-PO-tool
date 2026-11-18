// Proves the ported expense logic still behaves exactly like the original tool.
//   node --test src/modules/expenses/lib/parity.test.mjs
// 1. "port integrity": no ported file has been edited since it was ported (compares each file with PORT_MANIFEST.json).
// 2. "parity vectors": the 50 cases in parity_vectors.json (policy limits, approval route, advance notice, GSTIN, TDS) give
//    the same answers as the original code produced.
// Needs no database and no network: the Nucleus Supabase client is replaced by an inert stub for this run.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === "@/integrations/supabase/client") {
    return { url: 'data:text/javascript,export const supabase = new Proxy({}, { get: () => { throw new Error("the database was used in a rule test") } })', shortCircuit: true };
  }
  return next(specifier, context);
}`),
  import.meta.url,
);

const here = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(fs.readFileSync(path.join(here, "parity_vectors.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(here, "PORT_MANIFEST.json"), "utf8"));
const sha = (text) => crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

// ---------- 1. port integrity ----------
test("port integrity: every ported file is exactly as it was ported", () => {
  const edited = [];
  for (const f of manifest.files) {
    const file = path.join(here, f.ported);
    if (!fs.existsSync(file)) {
      edited.push(`${f.ported} (missing)`);
      continue;
    }
    if (sha(fs.readFileSync(file, "utf8")) !== f.portedSha256) edited.push(f.ported);
  }
  assert.deepEqual(
    edited,
    [],
    `These files were edited after the port: ${edited.join(", ")}. The rules in this folder must match the original tool. Re-run the port generator (scripts/migration/port-to-nucleus.mjs in the PR-PO tool repo) or, for a deliberate change, update PORT_MANIFEST.json and say why in the pull request.`,
  );
});

// ---------- 2. parity vectors ----------
const policy = await import("./policyEngine.ts");
const tds = await import("./tds.ts");
const advance = await import("./advanceValidation.ts");
const tax = await import("./taxChecks.ts");

const dmy = (d) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dmy(d);
};
const isoDaysAhead = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const verdict = (r) => ({ passed: r.passed === true, rule: r.rule, blocking: r.blocking === true });

for (const c of vectors.policy) {
  test(`policy: ${c.name}`, () => {
    const expense = { ...c.input };
    if (expense.daysAgo != null) {
      expense.date = daysAgo(expense.daysAgo);
      delete expense.daysAgo;
    }
    assert.deepEqual(verdict(policy[c.check](expense)), c.expect);
  });
}

for (const c of vectors.approval_route) {
  test(`approval route: ${c.name}`, () => {
    const r = policy.determineApprovalRoute([{ amount: c.input.total }], c.input.rules);
    assert.deepEqual({ levels: r.steps.slice(1) }, c.expect);
  });
}

for (const c of vectors.advance) {
  test(`advance: ${c.name}`, () => {
    if (c.input === undefined) {
      assert.deepEqual(
        { max_amount: advance.MAX_ADVANCE_AMOUNT, min_days_notice: advance.MIN_DAYS_NOTICE },
        c.expect,
      );
    } else {
      assert.deepEqual(
        { auto_rejected: advance.isAutoRejected(isoDaysAhead(c.input.daysAhead)) },
        c.expect,
      );
    }
  });
}

for (const c of vectors.gstin) {
  test(`gstin: ${c.name}`, () => {
    const r = tax.checkGstin(c.input.gstin);
    const actual = r
      ? { valid: r.valid, reason: r.reason ?? null, state: r.state ?? null, pan: r.pan ?? null }
      : null;
    assert.deepEqual(actual, c.expect);
  });
}

for (const c of vectors.tds) {
  test(`tds: ${c.name}`, () => {
    const r = tds.computeTds({ rules: vectors.tds_rules, ...c.input });
    assert.deepEqual(
      { status: r.status, section: r.section, rate: r.rate, amount: r.amount },
      c.expect,
    );
  });
}

for (const c of vectors.tds_split) {
  test(`tds split: ${c.name}`, () => {
    const r = tds.computeTdsSplit({ rules: vectors.tds_rules, ...c.input });
    assert.deepEqual(
      {
        status: r.status,
        base: r.base,
        amount: r.amount,
        section: r.section,
        lines: r.lines.map((l) => ({
          category: l.category,
          amount: l.amount,
          tds: l.tds,
          status: l.status,
        })),
      },
      c.expect,
    );
  });
}
