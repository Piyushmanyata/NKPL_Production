"use strict";
/**
 * api/lib/production-db.js
 * Postgres data layer for NKPL Production (Neon serverless — sole datastore).
 *
 * All functions return the same JSON shape the frontend expects:
 *   { date: "YYYY-MM-DD", lines: [...], tolerance: 1.5, updatedAt: "ISO" }
 */

const { getSql } = require("./neon");
const { normalizeMachineNameForStorage } = require("./normalize-machine");

const FIXED_TOLERANCE = 1.5;
const SOURCE_APP = "nkpl-production";
const MAX_LINES_PER_SHEET = 500;
const MAX_SHEETS_PER_IMPORT = 500;

function clientError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function conflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalTimestamp(value, field) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw clientError(`${field} must be a valid timestamp`);
  return date.toISOString();
}

function validateLine(line, index) {
  if (!line || typeof line !== "object") throw clientError(`Line ${index + 1} must be an object`);
  const id = String(line.id || "").trim();
  if (!id || id.length > 128) throw clientError(`Line ${index + 1} needs a valid ID`);

  const normalized = { ...line, id };
  ["machine", "shift", "item", "remark"].forEach((field) => {
    if (normalized[field] != null) normalized[field] = String(normalized[field]);
  });
  if (normalized.machine != null) {
    normalized.machine = normalizeMachineNameForStorage(normalized.machine);
  }
  ["cycleTime", "hours", "grammage", "kgPerBag", "actualBags"].forEach((field) => {
    if (normalized[field] == null || normalized[field] === "") return;
    const value = Number(normalized[field]);
    if (!Number.isFinite(value) || value < 0) throw clientError(`Line ${index + 1} has an invalid ${field}`);
    if (field === "hours" && value > 12) throw clientError(`Line ${index + 1} cannot exceed 12 hours per shift`);
    normalized[field] = value;
  });
  if (normalized.cavity != null && normalized.cavity !== "") {
    const cavity = Number(normalized.cavity);
    if (!Number.isInteger(cavity) || cavity < 0) throw clientError(`Line ${index + 1} has an invalid cavity`);
    normalized.cavity = cavity;
  }
  return normalized;
}

function validateSheet(sheet) {
  if (!sheet || !isValidDate(sheet.date) || !Array.isArray(sheet.lines)) {
    throw clientError("Invalid daily sheet");
  }
  if (sheet.lines.length > MAX_LINES_PER_SHEET) throw clientError(`A sheet may contain at most ${MAX_LINES_PER_SHEET} lines`);
  const lines = sheet.lines.map(validateLine);
  const ids = new Set(lines.map((line) => line.id));
  if (ids.size !== lines.length) throw clientError("A sheet cannot contain duplicate line IDs");
  return {
    ...sheet,
    date: sheet.date,
    lines,
    expectedUpdatedAt: optionalTimestamp(sheet.expectedUpdatedAt, "expectedUpdatedAt"),
  };
}

function validateSheets(sheets) {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > MAX_SHEETS_PER_IMPORT) {
    throw clientError(`Import must contain 1 to ${MAX_SHEETS_PER_IMPORT} sheets`);
  }
  const normalized = sheets.map(validateSheet);
  const dates = new Set(normalized.map((sheet) => sheet.date));
  if (dates.size !== normalized.length) throw clientError("Import cannot contain duplicate dates");
  return normalized;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a Postgres production_lines row (snake_case) to the camelCase
 * frontend line shape.
 */
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

/**
 * Convert a camelCase frontend line to snake_case Postgres values.
 */
function lineToParams(line) {
  const n = (v) => (v === "" || v == null ? null : Number(v));
  return {
    id:          line.id,
    machine:     line.machine    || "",
    shift:       line.shift      || "A",
    item:        line.item       || "",
    cycle_time:  n(line.cycleTime),
    cavity:      n(line.cavity)  != null ? Math.round(n(line.cavity)) : null,
    hours:       n(line.hours),
    grammage:    n(line.grammage),
    kg_per_bag:  n(line.kgPerBag),
    actual_bags: n(line.actualBags),
    remark:      line.remark    || null,
    from_calc:   line._fromCalc || false,
  };
}

function saveSheetQuery(sql, sheet, timestamp) {
  const { date, lines, expectedUpdatedAt } = sheet;
  const params = lines.map(lineToParams);
  const incomingIds = params.map((param) => param.id);

  return sql`
    WITH saved_sheet AS (
      INSERT INTO production_sheets (sheet_date, tolerance, updated_at, source_app, source_version)
      VALUES (
        ${date}::date,
        ${FIXED_TOLERANCE},
        ${timestamp}::timestamptz,
        ${SOURCE_APP},
        4
      )
      ON CONFLICT (sheet_date) DO UPDATE SET
        tolerance      = EXCLUDED.tolerance,
        updated_at     = EXCLUDED.updated_at,
        source_app     = EXCLUDED.source_app,
        source_version = EXCLUDED.source_version
      WHERE ${expectedUpdatedAt}::timestamptz IS NULL
         OR production_sheets.updated_at = ${expectedUpdatedAt}::timestamptz
      RETURNING id
    ),
    deleted_lines AS (
      DELETE FROM production_lines
      WHERE sheet_date = ${date}::date
        AND NOT (id = ANY(${incomingIds}::text[]))
        AND EXISTS (SELECT 1 FROM saved_sheet)
    ),
    saved_lines AS (
      INSERT INTO production_lines (
        id, sheet_id, sheet_date,
        machine, shift, item,
        cycle_time, cavity, hours, grammage, kg_per_bag, actual_bags,
        remark, from_calc,
        created_at, updated_at
      )
      SELECT
        u.id, s.id, ${date}::date,
        u.machine, u.shift, u.item,
        u.cycle_time, u.cavity, u.hours, u.grammage, u.kg_per_bag, u.actual_bags,
        u.remark, u.from_calc,
        NOW(), NOW()
      FROM UNNEST(
        ${params.map((p) => p.id)}::text[],
        ${params.map((p) => p.machine)}::text[],
        ${params.map((p) => p.shift)}::text[],
        ${params.map((p) => p.item)}::text[],
        ${params.map((p) => p.cycle_time)}::numeric[],
        ${params.map((p) => p.cavity)}::int[],
        ${params.map((p) => p.hours)}::numeric[],
        ${params.map((p) => p.grammage)}::numeric[],
        ${params.map((p) => p.kg_per_bag)}::numeric[],
        ${params.map((p) => p.actual_bags)}::numeric[],
        ${params.map((p) => p.remark)}::text[],
        ${params.map((p) => p.from_calc)}::boolean[]
      ) AS u(id, machine, shift, item, cycle_time, cavity, hours, grammage, kg_per_bag, actual_bags, remark, from_calc)
      CROSS JOIN saved_sheet s
      ON CONFLICT (sheet_date, id) DO UPDATE SET
        sheet_id    = EXCLUDED.sheet_id,
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
      RETURNING id
    )
    SELECT
      (SELECT id FROM saved_sheet) AS sheet_id,
      (SELECT COUNT(*)::int FROM saved_lines) AS line_count
  `;
}

function toDateString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoString(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Build the YYYY-MM-DD sequence starting at startDate for `days` days. */
function buildDateRange(startDate, days) {
  const dates = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Group flat (sheet LEFT JOIN lines) rows into the per-date sheet shape.
 * `seedDates`, if given, pre-populates empty sheets for dates with no row
 * at all (so callers always get a consistent one-entry-per-date result).
 */
function groupJoinedRows(rows, seedDates) {
  const byDate = new Map();

  for (const d of seedDates || []) {
    byDate.set(d, { date: d, lines: [], tolerance: FIXED_TOLERANCE, updatedAt: null });
  }

  for (const row of rows) {
    const date = toDateString(row.sheet_date);
    let sheet = byDate.get(date);
    if (!sheet) {
      sheet = { date, lines: [], tolerance: FIXED_TOLERANCE, updatedAt: null };
      byDate.set(date, sheet);
    }
    sheet.updatedAt = toIsoString(row.updated_at);

    if (row.line_id != null) {
      sheet.lines.push(rowToLine({
        id:          row.line_id,
        machine:     row.machine,
        shift:       row.shift,
        item:        row.item,
        cycle_time:  row.cycle_time,
        cavity:      row.cavity,
        hours:       row.hours,
        grammage:    row.grammage,
        kg_per_bag:  row.kg_per_bag,
        actual_bags: row.actual_bags,
        remark:      row.remark,
        from_calc:   row.from_calc,
      }));
    }
  }

  return byDate;
}

// ── Reads ──────────────────────────────────────────────────────────────────
//
// sheet_date is always cast to ::text in SQL. Postgres DATE columns carry no
// timezone, and node-postgres's default type parser turns them into a
// local-midnight JS Date — which then shifts to the wrong calendar day when
// re-serialized outside UTC (e.g. toISOString() in a UTC+5:30 process).
// Casting to text in the query sidesteps that entirely.

/**
 * Return all sheets in descending date order.
 * Single round trip via LEFT JOIN (sheets with no lines still come back
 * as an empty-lines entry).
 */
async function getAllSheets() {
  const sql = getSql();
  const rows = await sql`
    SELECT s.sheet_date::text AS sheet_date, s.updated_at,
           l.id AS line_id, l.machine, l.shift, l.item,
           l.cycle_time, l.cavity, l.hours, l.grammage, l.kg_per_bag, l.actual_bags,
           l.remark, l.from_calc
    FROM production_sheets s
    LEFT JOIN production_lines l ON l.sheet_id = s.id
    ORDER BY s.sheet_date DESC, l.created_at
  `;
  // ORDER BY sheet_date DESC guarantees the Map's insertion order is already
  // the desired descending order.
  return Array.from(groupJoinedRows(rows, []).values());
}

/**
 * Return sheets for a date range (start + N days), one entry per date,
 * chronological order. Single round trip via LEFT JOIN.
 */
async function getSheetsByDateRange(startDate, days) {
  const sql = getSql();
  const dates = buildDateRange(startDate, days);

  const rows = await sql`
    SELECT s.sheet_date::text AS sheet_date, s.updated_at,
           l.id AS line_id, l.machine, l.shift, l.item,
           l.cycle_time, l.cavity, l.hours, l.grammage, l.kg_per_bag, l.actual_bags,
           l.remark, l.from_calc
    FROM production_sheets s
    LEFT JOIN production_lines l ON l.sheet_id = s.id
    WHERE s.sheet_date = ANY(${dates}::date[])
    ORDER BY s.sheet_date, l.created_at
  `;

  const byDate = groupJoinedRows(rows, dates);
  return dates.map((d) => byDate.get(d));
}

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Upsert a single sheet and all its lines as one atomic Postgres transaction.
 * All lines are written via a single multi-row UPSERT (UNNEST of column
 * arrays) rather than one INSERT per line — a sheet with 20 lines is 3
 * statements total instead of 22, which cuts the WAL/index-maintenance
 * volume generated per autosave roughly proportionally to line count.
 * Returns the saved sheet in the same shape as a read.
 */
async function saveSheet(sheet) {
  const sql = getSql();
  const normalized = validateSheet(sheet);
  const timestamp = new Date().toISOString();
  const result = await saveSheetQuery(sql, normalized, timestamp);
  if (!result[0] || !result[0].sheet_id) {
    throw conflictError("This sheet changed on another device. Reload it before saving.");
  }

  return {
    date: normalized.date,
    lines: normalized.lines.map((line) => ({ ...line })),
    tolerance: FIXED_TOLERANCE,
    updatedAt: timestamp,
  };
}

/**
 * Bulk upsert sheets (used by POST /api/production for backup/CSV imports).
 * Sheets are deduplicated by date (last one wins, matching sequential-upsert
 * semantics) then saved with bounded concurrency for throughput.
 * Returns: { sheets: [...], imported: N }
 */
async function bulkSaveSheets(sheets) {
  const normalized = validateSheets(sheets).map((sheet) => ({ ...sheet, expectedUpdatedAt: null }));
  const sql = getSql();
  const timestamp = new Date().toISOString();
  const results = await sql.transaction(normalized.map((sheet) => saveSheetQuery(sql, sheet, timestamp)));
  if (results.some((rows) => !rows[0] || !rows[0].sheet_id)) {
    throw conflictError("Import could not be applied safely");
  }
  return {
    sheets: normalized.map((sheet) => ({ date: sheet.date, lines: sheet.lines.map((line) => ({ ...line })), tolerance: FIXED_TOLERANCE, updatedAt: timestamp })),
    imported: normalized.length,
  };
}

module.exports = {
  getAllSheets,
  getSheetsByDateRange,
  saveSheet,
  bulkSaveSheets,
  isValidDate,
  validateSheet,
  validateSheets,
};
