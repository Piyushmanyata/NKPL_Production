#!/usr/bin/env node
/**
 * Restore a PostgreSQL backup atomically.
 *
 * Usage:
 *   node scripts/restore-backup.mjs data/backup.json --merge
 *   node scripts/restore-backup.mjs data/backup.json --replace
 *
 * --merge upserts backup rows and preserves dates/lines not in the backup.
 * --replace makes the database match the backup, including deleting absent rows.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    const eq = trimmed.startsWith("#") ? -1 : trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* rely on the environment */ }

const [backupPath, ...flags] = process.argv.slice(2);
const replace = flags.includes("--replace");
const merge = flags.includes("--merge");
if (!backupPath || replace === merge) {
  console.error("Usage: node scripts/restore-backup.mjs <backup-file.json> --merge|--replace");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

let backup;
try {
  backup = JSON.parse(readFileSync(join(ROOT, backupPath), "utf8"));
} catch (error) {
  console.error(`❌  Could not read backup file: ${error.message}`);
  process.exit(1);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function timestamp(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid timestamp in backup");
  return date.toISOString();
}

function numeric(value, field) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (field === "hours" && number > 12)) throw new Error(`Invalid ${field} in backup`);
  return number;
}

function normalizeSheet(sheet) {
  if (!sheet || !validDate(sheet.date) || !Array.isArray(sheet.lines)) throw new Error("Backup contains an invalid sheet");
  const ids = new Set();
  const lines = sheet.lines.map((line, index) => {
    if (!line || typeof line !== "object") throw new Error(`Invalid line on ${sheet.date}`);
    const id = String(line.id || `migrated-${sheet.date}-${index + 1}`).trim();
    if (!id || id.length > 128 || ids.has(id)) throw new Error(`Duplicate or invalid line ID on ${sheet.date}`);
    ids.add(id);
    const cavity = numeric(line.cavity, "cavity");
    if (cavity != null && !Number.isInteger(cavity)) throw new Error("Invalid cavity in backup");
    return {
      id,
      machine: String(line.machine || ""), shift: String(line.shift || "A"), item: String(line.item || ""),
      cycleTime: numeric(line.cycleTime, "cycleTime"), cavity,
      hours: numeric(line.hours, "hours"), grammage: numeric(line.grammage, "grammage"),
      kgPerBag: numeric(line.kgPerBag, "kgPerBag"), actualBags: numeric(line.actualBags, "actualBags"),
      remark: line.remark == null ? null : String(line.remark), fromCalc: Boolean(line._fromCalc),
      createdAt: timestamp(line.createdAt), updatedAt: timestamp(line.updatedAt),
    };
  });
  return {
    date: sheet.date, lines,
    tolerance: numeric(sheet.tolerance, "tolerance") ?? 1.5,
    updatedAt: timestamp(sheet.updatedAt), createdAt: timestamp(sheet.createdAt),
    sourceApp: sheet.sourceApp || "nkpl-production", sourceVersion: Number.isInteger(sheet.sourceVersion) ? sheet.sourceVersion : 4,
  };
}

const sourceSheets = Array.isArray(backup) ? backup : backup && backup.sheets;
let sheets;
try {
  if (!Array.isArray(sourceSheets) || !sourceSheets.length) throw new Error("No sheets found in backup");
  sheets = sourceSheets.map(normalizeSheet);
  if (new Set(sheets.map((sheet) => sheet.date)).size !== sheets.length) throw new Error("Backup contains duplicate dates");
} catch (error) {
  console.error(`❌  ${error.message}`);
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

function restoreSheetQuery(sheet) {
  const ids = sheet.lines.map((line) => line.id);
  return sql`
    WITH saved_sheet AS (
      INSERT INTO production_sheets (sheet_date, tolerance, updated_at, source_app, source_version, created_at)
      VALUES (${sheet.date}::date, ${sheet.tolerance}, COALESCE(${sheet.updatedAt}::timestamptz, NOW()), ${sheet.sourceApp}, ${sheet.sourceVersion}, COALESCE(${sheet.createdAt}::timestamptz, NOW()))
      ON CONFLICT (sheet_date) DO UPDATE SET
        tolerance = EXCLUDED.tolerance, updated_at = EXCLUDED.updated_at,
        source_app = EXCLUDED.source_app, source_version = EXCLUDED.source_version
      RETURNING id
    ),
    stale_lines AS (
      DELETE FROM production_lines
      WHERE sheet_date = ${sheet.date}::date
        AND ${replace}
        AND NOT (id = ANY(${ids}::text[]))
    ),
    saved_lines AS (
      INSERT INTO production_lines (
        id, sheet_id, sheet_date, machine, shift, item,
        cycle_time, cavity, hours, grammage, kg_per_bag, actual_bags, remark, from_calc, created_at, updated_at
      )
      SELECT u.id, s.id, ${sheet.date}::date, u.machine, u.shift, u.item,
        u.cycle_time, u.cavity, u.hours, u.grammage, u.kg_per_bag, u.actual_bags, u.remark, u.from_calc,
        COALESCE(u.created_at, NOW()), COALESCE(u.updated_at, NOW())
      FROM UNNEST(
        ${sheet.lines.map((line) => line.id)}::text[], ${sheet.lines.map((line) => line.machine)}::text[], ${sheet.lines.map((line) => line.shift)}::text[], ${sheet.lines.map((line) => line.item)}::text[],
        ${sheet.lines.map((line) => line.cycleTime)}::numeric[], ${sheet.lines.map((line) => line.cavity)}::int[], ${sheet.lines.map((line) => line.hours)}::numeric[], ${sheet.lines.map((line) => line.grammage)}::numeric[],
        ${sheet.lines.map((line) => line.kgPerBag)}::numeric[], ${sheet.lines.map((line) => line.actualBags)}::numeric[], ${sheet.lines.map((line) => line.remark)}::text[], ${sheet.lines.map((line) => line.fromCalc)}::boolean[],
        ${sheet.lines.map((line) => line.createdAt)}::timestamptz[], ${sheet.lines.map((line) => line.updatedAt)}::timestamptz[]
      ) AS u(id, machine, shift, item, cycle_time, cavity, hours, grammage, kg_per_bag, actual_bags, remark, from_calc, created_at, updated_at)
      CROSS JOIN saved_sheet s
      ON CONFLICT (sheet_date, id) DO UPDATE SET
        sheet_id = EXCLUDED.sheet_id, machine = EXCLUDED.machine, shift = EXCLUDED.shift, item = EXCLUDED.item,
        cycle_time = EXCLUDED.cycle_time, cavity = EXCLUDED.cavity, hours = EXCLUDED.hours, grammage = EXCLUDED.grammage,
        kg_per_bag = EXCLUDED.kg_per_bag, actual_bags = EXCLUDED.actual_bags, remark = EXCLUDED.remark,
        from_calc = EXCLUDED.from_calc, updated_at = EXCLUDED.updated_at
      RETURNING id
    )
    SELECT (SELECT id FROM saved_sheet) AS sheet_id, (SELECT COUNT(*)::int FROM saved_lines) AS line_count
  `;
}

const displayUrl = process.env.DATABASE_URL.replace(/:([^@:]+)@/, ":****@");
console.log(`Restoring ${sheets.length} sheet(s) in ${replace ? "REPLACE" : "MERGE"} mode to ${displayUrl}`);

try {
  const queries = replace
    ? [sql`DELETE FROM production_sheets WHERE NOT (sheet_date = ANY(${sheets.map((sheet) => sheet.date)}::date[]))`]
    : [];
  queries.push(...sheets.map(restoreSheetQuery));
  const results = await sql.transaction(queries);
  const sheetResults = replace ? results.slice(1) : results;
  if (sheetResults.some((rows) => !rows[0] || !rows[0].sheet_id)) throw new Error("Restore did not save every sheet");
  const lines = sheets.reduce((total, sheet) => total + sheet.lines.length, 0);
  console.log(`✅  Restored ${sheets.length} sheet(s) and ${lines} line(s) atomically.`);
  console.log(`Next: node scripts/verify-backup.mjs ${backupPath}`);
} catch (error) {
  console.error(`❌  Restore rolled back: ${error.message}`);
  process.exit(1);
}
