#!/usr/bin/env node
/**
 * scripts/cleanup-machine-names.mjs
 *
 * One-shot cleanup: rewrite stored production_lines.machine values that are
 * typos/variants of "Machine N" (e.g. "Mchine 1") to the canonical label.
 *
 * Usage:
 *   node scripts/cleanup-machine-names.mjs            # dry-run (default)
 *   node scripts/cleanup-machine-names.mjs --apply    # write changes
 *
 * Requires DATABASE_URL in .env.local or environment.
 * Prefer running backup-postgres.mjs first.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(import.meta.url);
const { normalizeMachineNameForStorage } = require("../api/lib/normalize-machine.js");

try {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* rely on env already set */ }

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Machine name cleanup");
console.log(`  Mode: ${apply ? "APPLY (writes DB)" : "DRY-RUN (no writes)"}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const rows = await sql`
  SELECT machine, COUNT(*)::int AS n
  FROM production_lines
  GROUP BY machine
  ORDER BY machine
`;

const changes = [];
let alreadyOk = 0;
for (const row of rows) {
  const from = row.machine == null ? "" : String(row.machine);
  const to = normalizeMachineNameForStorage(from);
  if (from === to) {
    alreadyOk += Number(row.n) || 0;
    continue;
  }
  changes.push({ from, to, n: Number(row.n) || 0 });
}

if (!changes.length) {
  console.log(`  No renames needed (${alreadyOk} row(s) already canonical).`);
  process.exit(0);
}

const totalRows = changes.reduce((sum, c) => sum + c.n, 0);
console.log(`  ${changes.length} distinct label(s) → ${totalRows} row(s) to rewrite:\n`);
for (const c of changes) {
  console.log(`    ${JSON.stringify(c.from)}  →  ${JSON.stringify(c.to)}  (${c.n} row(s))`);
}
console.log();

if (!apply) {
  console.log("  Dry-run only. Re-run with --apply to write these updates.");
  process.exit(0);
}

let updated = 0;
for (const c of changes) {
  const result = await sql`
    UPDATE production_lines
    SET machine = ${c.to},
        updated_at = NOW()
    WHERE machine = ${c.from}
    RETURNING id
  `;
  const n = Array.isArray(result) ? result.length : 0;
  updated += n;
  console.log(`  ✓ ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}  (${n} row(s))`);
}

console.log();
console.log(`  Done. Updated ${updated} row(s).`);
