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
    id:         row.line_id,
    machine:    row.machine    || "",
    shift:      row.shift      || "A",
    item:       row.item       || "",
    cycleTime:  row.cycle_time  != null ? Number(row.cycle_time)  : "",
    cavity:     row.cavity      != null ? Number(row.cavity)      : "",
    hours:      row.hours       != null ? Number(row.hours)       : "",
    grammage:   row.grammage    != null ? Number(row.grammage)    : "",
    kgPerBag:   row.kg_per_bag  != null ? Number(row.kg_per_bag)  : "",
    actualBags: row.actual_bags != null ? Number(row.actual_bags) : "",
    remark:     row.remark == null ? null : row.remark,
    _fromCalc:  row.from_calc  || false,
    createdAt:  row.line_created_at || null,
    updatedAt:  row.line_updated_at || null,
  };
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Postgres Backup");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// One joined statement gives one database snapshot. Separate sheet/line reads
// can miss a row created between requests and cannot support exact recovery.
const rows = await sql`
  SELECT
    s.sheet_date::text AS sheet_date, s.tolerance,
    s.updated_at::text AS sheet_updated_at, s.created_at::text AS sheet_created_at,
    s.source_app, s.source_version,
    l.id AS line_id, l.machine, l.shift, l.item,
    l.cycle_time, l.cavity, l.hours, l.grammage, l.kg_per_bag, l.actual_bags,
    l.remark, l.from_calc,
    l.created_at::text AS line_created_at, l.updated_at::text AS line_updated_at
  FROM production_sheets s
  LEFT JOIN production_lines l ON l.sheet_id = s.id
  ORDER BY s.sheet_date, l.created_at, l.id
`;

const byDate = new Map();
for (const row of rows) {
  if (!byDate.has(row.sheet_date)) {
    byDate.set(row.sheet_date, {
      date: row.sheet_date,
      lines: [],
      tolerance: row.tolerance == null ? 1.5 : Number(row.tolerance),
      updatedAt: row.sheet_updated_at || null,
      createdAt: row.sheet_created_at || null,
      sourceApp: row.source_app || null,
      sourceVersion: row.source_version == null ? null : Number(row.source_version),
    });
  }
  if (row.line_id != null) byDate.get(row.sheet_date).lines.push(rowToLine(row));
}

const backupSheets = Array.from(byDate.values());

const now = new Date();
const ts = now.toISOString().replace("T", "-").replace(/:/g, "").slice(0, 15);

const backup = {
  app:        "nkpl-production",
  version:    4,
  format:     "raw-v1",
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
