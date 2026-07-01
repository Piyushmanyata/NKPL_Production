#!/usr/bin/env node
/**
 * scripts/verify-backup.mjs
 *
 * Compares a JSON backup file (from scripts/backup-postgres.mjs) against the
 * live Neon Postgres data to confirm every sheet and line still matches —
 * e.g. after a restore, or as a periodic integrity check.
 *
 * Usage:
 *   node scripts/verify-backup.mjs data/postgres-backup-YYYY-MM-DD-HHMM.json
 *
 * Requires:
 *   DATABASE_URL in .env.local or environment
 */

import { readFileSync } from "fs";
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

// ── Args ─────────────────────────────────────────────────────────────────────
const backupPath = process.argv[2];
if (!backupPath) {
  console.error("❌  Usage: node scripts/verify-backup.mjs <backup-file.json>");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

// ── Load backup ──────────────────────────────────────────────────────────────
let backup;
try {
  backup = JSON.parse(readFileSync(join(ROOT, backupPath), "utf8"));
} catch (err) {
  console.error(`❌  Could not read backup file: ${err.message}`);
  process.exit(1);
}

const jsonSheets = Array.isArray(backup) ? backup : (backup.sheets || []);

// ── Neon connection ───────────────────────────────────────────────────────────
let neonModule;
try {
  neonModule = await import("@neondatabase/serverless");
} catch {
  console.error("❌  @neondatabase/serverless not installed. Run: npm install");
  process.exit(1);
}

const { neon } = neonModule;
const sql = neon(DATABASE_URL);

// ── Gather stats from JSON backup ─────────────────────────────────────────────
function hasLineContent(line) {
  if (!line || typeof line !== "object") return false;
  return ["machine", "shift", "item", "cycleTime", "cavity", "hours",
          "grammage", "kgPerBag", "actualBags", "remark"].some((k) => {
    const v = line[k];
    return v !== null && v !== undefined && String(v).trim() !== "";
  });
}

function n(v) {
  if (v === "" || v == null) return null;
  const p = Number(v);
  return Number.isFinite(p) ? p : null;
}

const jsonAllSheets = jsonSheets.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date || ""));
const jsonContentSheets = jsonAllSheets.filter(
  (s) => Array.isArray(s.lines) && s.lines.some(hasLineContent)
);
const jsonTotalLines = jsonContentSheets.reduce(
  (sum, s) => sum + s.lines.filter(hasLineContent).length, 0
);

// Per-date actual_bags and actual_kg sums from JSON
const jsonDateMap = {};
for (const sheet of jsonContentSheets) {
  let bags = 0, kg = 0;
  for (const l of sheet.lines.filter(hasLineContent)) {
    const ab  = n(l.actualBags)  || 0;
    const kpb = n(l.kgPerBag)    || 0;
    bags += ab;
    kg   += ab * kpb;
  }
  jsonDateMap[sheet.date] = { bags: Math.round(bags * 1000) / 1000, kg: Math.round(kg * 1000) / 1000 };
}

const jsonLatestDate = jsonContentSheets.length
  ? jsonContentSheets.map((s) => s.date).sort().reverse()[0]
  : null;

// ── Gather stats from Postgres ────────────────────────────────────────────────
const [pgSheetCount] = await sql`SELECT COUNT(*)::int AS cnt FROM production_sheets`;
const [pgLineCount]  = await sql`SELECT COUNT(*)::int AS cnt FROM production_lines`;
const [pgLatest]     = await sql`SELECT MAX(sheet_date)::text AS d FROM production_sheets`;

// Per-date raw totals from Postgres (no analytics — raw columns only)
const pgDateTotals = await sql`
  SELECT
    sheet_date::text                             AS date,
    SUM(actual_bags)                             AS total_bags,
    SUM(actual_bags * kg_per_bag)                AS total_kg
  FROM production_lines
  GROUP BY sheet_date
  ORDER BY sheet_date
`;

const pgDateMap = {};
for (const row of pgDateTotals) {
  pgDateMap[row.date] = {
    bags: Math.round(Number(row.total_bags || 0) * 1000) / 1000,
    kg:   Math.round(Number(row.total_kg   || 0) * 1000) / 1000,
  };
}

// ── Print comparison table ────────────────────────────────────────────────────
const COL = 28;
function row(label, jsonVal, pgVal, ok) {
  const l = String(label).padEnd(COL);
  const j = String(jsonVal).padEnd(16);
  const p = String(pgVal).padEnd(16);
  const m = ok ? "  ✅" : "  ❌ MISMATCH";
  console.log(`  ${l}  ${j}  ${p}  ${m}`);
}
function divider() {
  console.log("  " + "─".repeat(82));
}

const displayUrl = DATABASE_URL.replace(/:([^@:]+)@/, ":****@");

console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Backup Verification Report");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Backup   : ${backupPath}`);
console.log(`  Database : ${displayUrl}`);
console.log(`  Checked  : ${new Date().toISOString()}`);
console.log();
console.log(`  ${"Metric".padEnd(COL)}  ${"Backup JSON".padEnd(16)}  ${"Postgres".padEnd(16)}  Match?`);
divider();

const sheetMatch   = jsonAllSheets.length === pgSheetCount.cnt;
const lineMatch    = jsonTotalLines === pgLineCount.cnt;
const latestMatch  = jsonLatestDate === pgLatest.d;

row("Sheet count",   jsonAllSheets.length,     pgSheetCount.cnt, sheetMatch);
row("Line count",    jsonTotalLines,            pgLineCount.cnt,  lineMatch);
row("Latest date",   jsonLatestDate || "—",    pgLatest.d || "—", latestMatch);

divider();

// Per-date breakdown (first 10 dates)
const allDates = Array.from(new Set([
  ...Object.keys(jsonDateMap),
  ...Object.keys(pgDateMap)
])).sort().reverse().slice(0, 10);

let dateMismatches = 0;

if (allDates.length > 0) {
  console.log(`\n  ${"Date".padEnd(12)}  ${"JSON bags".padEnd(12)}  ${"PG bags".padEnd(12)}  ${"JSON kg".padEnd(12)}  ${"PG kg".padEnd(12)}  Match?`);
  console.log("  " + "─".repeat(82));

  for (const date of allDates) {
    const j = jsonDateMap[date] || { bags: 0, kg: 0 };
    const p = pgDateMap[date]   || { bags: 0, kg: 0 };
    const bagsOk = Math.abs(j.bags - p.bags) < 0.01;
    const kgOk   = Math.abs(j.kg   - p.kg)   < 0.1;
    const ok     = bagsOk && kgOk;
    if (!ok) dateMismatches++;
    console.log(
      `  ${date.padEnd(12)}  ${String(j.bags).padEnd(12)}  ${String(p.bags).padEnd(12)}  ` +
      `${String(j.kg.toFixed(1)).padEnd(12)}  ${String(p.kg.toFixed(1)).padEnd(12)}  ${ok ? "✅" : "❌"}`
    );
  }
  if (allDates.length < Math.max(Object.keys(jsonDateMap).length, Object.keys(pgDateMap).length)) {
    console.log(`  ... (showing latest ${allDates.length} dates)`);
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
const allPass = sheetMatch && lineMatch && latestMatch && dateMismatches === 0;

console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
if (allPass) {
  console.log("  ✅  VERIFICATION PASSED — Postgres matches the backup exactly.");
} else {
  console.log("  ❌  VERIFICATION FAILED — See mismatches above.");
  console.log("      Investigate discrepancies before relying on this backup.");
  process.exit(1);
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log();
