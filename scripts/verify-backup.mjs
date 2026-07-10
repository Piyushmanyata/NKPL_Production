#!/usr/bin/env node
/** Compare every recoverable sheet and line field in a backup with Neon. */

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

const backupPath = process.argv[2];
if (!backupPath || !process.env.DATABASE_URL) {
  console.error("Usage: node scripts/verify-backup.mjs <backup-file.json> (requires DATABASE_URL)");
  process.exit(1);
}

let backup;
try {
  backup = JSON.parse(readFileSync(join(ROOT, backupPath), "utf8"));
} catch (error) {
  console.error(`❌  Could not read backup: ${error.message}`);
  process.exit(1);
}

const sheets = Array.isArray(backup) ? backup : backup && backup.sheets;
if (!Array.isArray(sheets) || !sheets.length) {
  console.error("❌  No sheets found in backup.");
  process.exit(1);
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function lineShape(line, exact) {
  return {
    id: String(line.id || ""), machine: String(line.machine || ""), shift: String(line.shift || "A"), item: String(line.item || ""),
    cycleTime: number(line.cycleTime ?? line.cycle_time), cavity: number(line.cavity), hours: number(line.hours),
    grammage: number(line.grammage), kgPerBag: number(line.kgPerBag ?? line.kg_per_bag), actualBags: number(line.actualBags ?? line.actual_bags),
    remark: line.remark == null ? null : String(line.remark), fromCalc: Boolean(line._fromCalc ?? line.from_calc),
    ...(exact ? { createdAt: iso(line.createdAt ?? line.line_created_at), updatedAt: iso(line.updatedAt ?? line.line_updated_at) } : {}),
  };
}

function sheetShape(sheet, exact) {
  const lines = new Map();
  for (const line of Array.isArray(sheet.lines) ? sheet.lines : []) {
    const shaped = lineShape(line, exact);
    if (!shaped.id || lines.has(shaped.id)) throw new Error(`Invalid or duplicate line ID on ${sheet.date}`);
    lines.set(shaped.id, shaped);
  }
  return {
    date: sheet.date, tolerance: number(sheet.tolerance) ?? 1.5, lines,
    ...(exact ? {
      updatedAt: iso(sheet.updatedAt ?? sheet.sheet_updated_at), createdAt: iso(sheet.createdAt ?? sheet.sheet_created_at),
      sourceApp: sheet.sourceApp ?? sheet.source_app ?? null, sourceVersion: number(sheet.sourceVersion ?? sheet.source_version),
    } : {}),
  };
}

const exact = backup && backup.version >= 4 && backup.format === "raw-v1";
let expected;
try {
  expected = new Map(sheets.map((sheet) => [sheet.date, sheetShape(sheet, exact)]));
  if (expected.size !== sheets.length) throw new Error("Backup contains duplicate dates");
} catch (error) {
  console.error(`❌  ${error.message}`);
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT s.sheet_date::text AS date, s.tolerance, s.updated_at::text AS sheet_updated_at,
    s.created_at::text AS sheet_created_at, s.source_app, s.source_version,
    l.id, l.machine, l.shift, l.item, l.cycle_time, l.cavity, l.hours, l.grammage, l.kg_per_bag, l.actual_bags,
    l.remark, l.from_calc, l.created_at::text AS line_created_at, l.updated_at::text AS line_updated_at
  FROM production_sheets s
  LEFT JOIN production_lines l ON l.sheet_id = s.id
  ORDER BY s.sheet_date, l.id
`;

const actual = new Map();
for (const row of rows) {
  if (!actual.has(row.date)) actual.set(row.date, { date: row.date, tolerance: row.tolerance, updatedAt: row.sheet_updated_at, createdAt: row.sheet_created_at, sourceApp: row.source_app, sourceVersion: row.source_version, lines: [] });
  if (row.id != null) actual.get(row.date).lines.push(row);
}

const differences = [];
function mismatch(path, expectedValue, actualValue) {
  if (differences.length < 25) differences.push(`${path}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
}
function same(left, right) { return left === right || (typeof left === "number" && typeof right === "number" && Math.abs(left - right) < 1e-9); }

for (const date of new Set([...expected.keys(), ...actual.keys()])) {
  const left = expected.get(date);
  const rawRight = actual.get(date);
  if (!left || !rawRight) {
    mismatch(`sheet ${date}`, Boolean(left), Boolean(rawRight));
    continue;
  }
  const right = sheetShape(rawRight, exact);
  ["tolerance", ...(exact ? ["updatedAt", "createdAt", "sourceApp", "sourceVersion"] : [])].forEach((field) => {
    if (!same(left[field], right[field])) mismatch(`sheet ${date}.${field}`, left[field], right[field]);
  });
  for (const id of new Set([...left.lines.keys(), ...right.lines.keys()])) {
    const expectedLine = left.lines.get(id);
    const actualLine = right.lines.get(id);
    if (!expectedLine || !actualLine) {
      mismatch(`line ${date}/${id}`, Boolean(expectedLine), Boolean(actualLine));
      continue;
    }
    Object.keys(expectedLine).forEach((field) => {
      if (!same(expectedLine[field], actualLine[field])) mismatch(`line ${date}/${id}.${field}`, expectedLine[field], actualLine[field]);
    });
  }
}

console.log(`Checked ${expected.size} backup sheet(s) against ${actual.size} database sheet(s).`);
if (differences.length) {
  console.error(`❌  Verification failed with ${differences.length}${differences.length === 25 ? "+" : ""} difference(s):`);
  differences.forEach((difference) => console.error(`  - ${difference}`));
  process.exit(1);
}
console.log(exact
  ? "✅  VERIFICATION PASSED — every raw sheet, line, and preserved metadata field matches."
  : "✅  VERIFICATION PASSED — every comparable legacy backup field matches (metadata was not present in this format).");
