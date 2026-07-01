#!/usr/bin/env node
/**
 * scripts/backup-postgres.mjs
 *
 * Exports ALL production data from Neon Postgres to a timestamped JSON file
 * in data/. Use this periodically (or before risky schema changes) since
 * Postgres is now the sole datastore — this is its off-database safety net.
 *
 * Usage:
 *   node scripts/backup-postgres.mjs
 *
 * Requires:
 *   DATABASE_URL in .env.local or environment
 *
 * Restore with:
 *   node scripts/restore-backup.mjs data/<file>.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Load .env.local ──────────────────────────────────────────────────────────
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

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

function rowToLine(row) {
  return {
    id:         row.id,
    machine:    row.machine    || "",
    shift:      row.shift      || "A",
    item:       row.item       || "",
    cycleTime:  row.cycle_time  != null ? Number(row.cycle_time)  : "",
    cavity:     row.cavity      != null ? Number(row.cavity)      : "",
    hours:      row.hours       != null ? Number(row.hours)       : "",
    grammage:   row.grammage    != null ? Number(row.grammage)    : "",
    kgPerBag:   row.kg_per_bag  != null ? Number(row.kg_per_bag)  : "",
    actualBags: row.actual_bags != null ? Number(row.actual_bags) : "",
    remark:     row.remark     || "",
    _fromCalc:  row.from_calc  || false,
  };
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Postgres Backup");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// sheet_date is cast to ::text so we get a plain "YYYY-MM-DD" string —
// Postgres DATE columns have no timezone, and the driver's default Date
// parsing shifts them to the wrong calendar day outside a UTC process.
const sheets = await sql`SELECT id, sheet_date::text AS sheet_date, tolerance, updated_at, source_app, source_version FROM production_sheets ORDER BY sheet_date`;
const sheetIds = sheets.map((s) => s.id);
const lines = sheetIds.length
  ? await sql`SELECT * FROM production_lines WHERE sheet_id = ANY(${sheetIds}) ORDER BY sheet_date, created_at`
  : [];

const linesBySheet = {};
for (const line of lines) {
  const sid = String(line.sheet_id);
  if (!linesBySheet[sid]) linesBySheet[sid] = [];
  linesBySheet[sid].push(line);
}

const backupSheets = sheets.map((s) => ({
  date:      s.sheet_date,
  lines:     (linesBySheet[String(s.id)] || []).map(rowToLine),
  tolerance: Number(s.tolerance) || 1.5,
  updatedAt: s.updated_at ? new Date(s.updated_at).toISOString() : null,
}));

const now = new Date();
const ts = now.toISOString().replace("T", "-").replace(/:/g, "").slice(0, 15);

const backup = {
  app:        "nkpl-production",
  version:    3,
  exportedAt: now.toISOString(),
  source:     "postgres",
  sheets:     backupSheets,
};

const dataDir = join(ROOT, "data");
mkdirSync(dataDir, { recursive: true });
const filename = `postgres-backup-${ts}.json`;
const filepath = join(dataDir, filename);
writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf8");

const fileSizeKb = (readFileSync(filepath).length / 1024).toFixed(1);
const totalLines = backupSheets.reduce((sum, s) => sum + s.lines.length, 0);

console.log(`  Sheets      : ${backupSheets.length}`);
console.log(`  Lines       : ${totalLines}`);
console.log(`  File size   : ${fileSizeKb} KB`);
console.log(`  Saved to    : data/${filename}`);
console.log();
console.log("  ✅  Backup complete");
console.log();
