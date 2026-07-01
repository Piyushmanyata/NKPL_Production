#!/usr/bin/env node
/**
 * scripts/restore-backup.mjs
 *
 * Imports a JSON backup file (from scripts/backup-postgres.mjs) into Neon
 * Postgres. Only stores raw production line data — NO analytics or
 * calculated fields. Analytics are computed on the fly by the SQL view or
 * the frontend. Use this to restore from a backup after data loss.
 *
 * Usage:
 *   node scripts/restore-backup.mjs data/postgres-backup-YYYY-MM-DD-HHMM.json
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
  console.error("❌  Usage: node scripts/restore-backup.mjs <backup-file.json>");
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
  const raw = readFileSync(join(ROOT, backupPath), "utf8");
  backup = JSON.parse(raw);
} catch (err) {
  console.error(`❌  Could not read backup file: ${err.message}`);
  process.exit(1);
}

const sheets = Array.isArray(backup)
  ? backup
  : Array.isArray(backup.sheets)
    ? backup.sheets
    : [];

if (sheets.length === 0) {
  console.error("❌  No sheets found in backup file.");
  process.exit(1);
}

// ── Neon connection ──────────────────────────────────────────────────────────
let neonModule;
try {
  neonModule = await import("@neondatabase/serverless");
} catch {
  console.error("❌  @neondatabase/serverless not installed. Run: npm install");
  process.exit(1);
}

const { neon } = neonModule;
const sql = neon(DATABASE_URL);

// ── Helpers ──────────────────────────────────────────────────────────────────
const FIXED_TOLERANCE = 1.5;

function validDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || "");
}

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
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

// ── Restore ────────────────────────────────────────────────────────────────────
const displayUrl = DATABASE_URL.replace(/:([^@:]+)@/, ":****@");

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Restore Backup to Postgres");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Source   : ${backupPath}`);
console.log(`  Database : ${displayUrl}`);
console.log(`  Sheets   : ${sheets.length} found in backup`);
console.log();

let sheetsImported = 0;
let sheetsSkipped  = 0;
let linesImported  = 0;
let linesSkipped   = 0;
const errors       = [];

for (const sheet of sheets) {
  if (!validDate(sheet.date)) {
    sheetsSkipped++;
    errors.push(`Sheet skipped — invalid date: ${JSON.stringify(sheet.date)}`);
    continue;
  }

  const lines = Array.isArray(sheet.lines)
    ? sheet.lines.filter(hasLineContent)
    : [];

  process.stdout.write(`  Importing ${sheet.date} (${lines.length} lines)... `);

  try {
    // Upsert the sheet row — stores ONLY date, tolerance, updatedAt, source metadata
    // No analytics, no calculations stored here.
    const [sheetRow] = await sql`
      INSERT INTO production_sheets (sheet_date, tolerance, updated_at, source_app, source_version)
      VALUES (
        ${sheet.date}::date,
        ${FIXED_TOLERANCE},
        ${sheet.updatedAt || new Date().toISOString()}::timestamptz,
        'nkpl-production',
        3
      )
      ON CONFLICT (sheet_date) DO UPDATE SET
        tolerance      = EXCLUDED.tolerance,
        updated_at     = EXCLUDED.updated_at,
        source_app     = EXCLUDED.source_app,
        source_version = EXCLUDED.source_version
      RETURNING id, sheet_date
    `;

    const sheetId = sheetRow.id;
    let sheetLinesOk = 0;
    let sheetLinesFail = 0;

    for (const line of lines) {
      // Generate an id if the line doesn't have one (old backups may lack ids)
      const lineId = line.id || ("migrated-" + sheet.date + "-" + Math.random().toString(36).slice(2, 10));

      // Map camelCase → snake_case. Store RAW values only — no calculated fields.
      try {
        await sql`
          INSERT INTO production_lines (
            id, sheet_id, sheet_date,
            machine, shift, item,
            cycle_time, cavity, hours, grammage, kg_per_bag, actual_bags,
            remark, from_calc,
            created_at, updated_at
          ) VALUES (
            ${lineId},
            ${sheetId},
            ${sheet.date}::date,
            ${line.machine    || ""},
            ${line.shift      || "A"},
            ${line.item       || ""},
            ${n(line.cycleTime)},
            ${n(line.cavity) != null ? Math.round(n(line.cavity)) : null},
            ${n(line.hours)},
            ${n(line.grammage)},
            ${n(line.kgPerBag)},
            ${n(line.actualBags)},
            ${line.remark    || null},
            ${line._fromCalc || false},
            NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            sheet_id    = EXCLUDED.sheet_id,
            sheet_date  = EXCLUDED.sheet_date,
            machine     = EXCLUDED.machine,
            shift       = EXCLUDED.shift,
            item        = EXCLUDED.item,
            cycle_time  = EXCLUDED.cycle_time,
            cavity      = EXCLUDED.cavity,
            hours       = EXCLUDED.hours,
            grammage    = EXCLUDED.grammage,
            kg_per_bag  = EXCLUDED.kg_per_bag,
            actual_bags = EXCLUDED.actual_bags,
            remark      = EXCLUDED.remark,
            from_calc   = EXCLUDED.from_calc,
            updated_at  = NOW()
        `;
        sheetLinesOk++;
      } catch (lineErr) {
        sheetLinesFail++;
        errors.push(`  Line error [${sheet.date}/${lineId}]: ${lineErr.message}`);
      }
    }

    linesImported += sheetLinesOk;
    linesSkipped  += sheetLinesFail;
    sheetsImported++;
    console.log(`✅  (${sheetLinesOk} ok, ${sheetLinesFail} failed)`);

  } catch (sheetErr) {
    sheetsSkipped++;
    errors.push(`  Sheet error [${sheet.date}]: ${sheetErr.message}`);
    console.log(`❌`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Restore Summary");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Sheets imported : ${sheetsImported}`);
console.log(`  Sheets skipped  : ${sheetsSkipped}`);
console.log(`  Lines imported  : ${linesImported}`);
console.log(`  Lines skipped   : ${linesSkipped}`);
console.log(`  Errors          : ${errors.length}`);

if (errors.length > 0) {
  console.log();
  console.log("  Error details:");
  errors.forEach((e) => console.log("  " + e));
}

console.log();
if (errors.length === 0) {
  console.log("  ✅  Restore completed with no errors.");
  console.log();
  console.log("  Next step:");
  console.log(`  node scripts/verify-backup.mjs ${backupPath}`);
} else {
  console.log("  ⚠️   Restore completed with errors. Review above.");
  process.exit(1);
}
