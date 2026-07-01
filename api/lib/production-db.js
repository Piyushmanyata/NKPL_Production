"use strict";
/**
 * api/lib/production-db.js
 * Postgres data layer for NKPL Production (Neon serverless — sole datastore).
 *
 * All functions return the same JSON shape the frontend expects:
 *   { date: "YYYY-MM-DD", lines: [...], tolerance: 1.5, updatedAt: "ISO" }
 */

const { getSql } = require("./neon");

const FIXED_TOLERANCE = 1.5;
const SOURCE_APP = "nkpl-production";

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
 * Upsert a single sheet and all its lines as one atomic Postgres transaction
 * (one HTTP round trip regardless of line count).
 * Returns the saved sheet in the same shape as a read.
 */
async function saveSheet(sheet) {
  const sql = getSql();
  const { date, lines = [], updatedAt } = sheet;
  const timestamp = updatedAt || new Date().toISOString();

  const validLines = lines.filter((l) => l && l.id);
  const incomingIds = validLines.map((l) => l.id);

  const queries = [
    sql`
      INSERT INTO production_sheets (sheet_date, tolerance, updated_at, source_app, source_version)
      VALUES (
        ${date}::date,
        ${FIXED_TOLERANCE},
        ${timestamp}::timestamptz,
        ${SOURCE_APP},
        3
      )
      ON CONFLICT (sheet_date) DO UPDATE SET
        tolerance      = EXCLUDED.tolerance,
        updated_at     = EXCLUDED.updated_at,
        source_app     = EXCLUDED.source_app,
        source_version = EXCLUDED.source_version
    `,
    incomingIds.length > 0
      ? sql`
          DELETE FROM production_lines
          WHERE sheet_date = ${date}::date
            AND id <> ALL(${incomingIds})
        `
      : sql`DELETE FROM production_lines WHERE sheet_date = ${date}::date`,
  ];

  for (const line of validLines) {
    const p = lineToParams(line);
    queries.push(sql`
      INSERT INTO production_lines (
        id, sheet_id, sheet_date,
        machine, shift, item,
        cycle_time, cavity, hours, grammage, kg_per_bag, actual_bags,
        remark, from_calc,
        created_at, updated_at
      ) VALUES (
        ${p.id},
        (SELECT id FROM production_sheets WHERE sheet_date = ${date}::date),
        ${date}::date,
        ${p.machine}, ${p.shift}, ${p.item},
        ${p.cycle_time}, ${p.cavity}, ${p.hours}, ${p.grammage}, ${p.kg_per_bag}, ${p.actual_bags},
        ${p.remark}, ${p.from_calc},
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
    `);
  }

  await sql.transaction(queries);

  return {
    date,
    lines: validLines.map((l) => ({ ...l })),
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
  const byDate = new Map();
  for (const sheet of sheets) byDate.set(sheet.date, sheet);
  const uniqueSheets = Array.from(byDate.values());

  const CONCURRENCY = 5;
  const saved = [];

  for (let i = 0; i < uniqueSheets.length; i += CONCURRENCY) {
    const batch = uniqueSheets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((sheet) =>
        saveSheet(sheet).catch((err) => {
          console.error(`[production-db] Failed to save sheet ${sheet.date}:`, err.message);
          return null;
        })
      )
    );
    saved.push(...results.filter(Boolean));
  }

  return { sheets: saved, imported: saved.length };
}

module.exports = {
  getAllSheets,
  getSheetsByDateRange,
  saveSheet,
  bulkSaveSheets,
};
