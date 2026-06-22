"use strict";
/**
 * api/lib/production-db.js
 * Postgres data layer for NKPL Production.
 *
 * All functions return the SAME JSON shape that the old Upstash code returned:
 *   { date: "YYYY-MM-DD", lines: [...], tolerance: 1.5, updatedAt: "ISO" }
 *
 * This keeps the frontend (app.js) untouched.
 */

const { getSql } = require("./neon");

const FIXED_TOLERANCE = 1.5;
const SOURCE_APP = "nkpl-production";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a Postgres production_lines row back to the camelCase frontend shape.
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
function lineToParams(line, sheetId, sheetDate) {
  const n = (v) => (v === "" || v == null ? null : Number(v));
  return {
    id:         line.id,
    sheet_id:   sheetId,
    sheet_date: sheetDate,
    machine:    line.machine    || "",
    shift:      line.shift      || "A",
    item:       line.item       || "",
    cycle_time: n(line.cycleTime),
    cavity:     n(line.cavity)  != null ? Math.round(n(line.cavity)) : null,
    hours:      n(line.hours),
    grammage:   n(line.grammage),
    kg_per_bag: n(line.kgPerBag),
    actual_bags:n(line.actualBags),
    remark:     line.remark    || null,
    from_calc:  line._fromCalc || false,
  };
}

/**
 * Assemble a sheet-shaped object from a sheet row and its line rows.
 */
function buildSheet(sheetRow, lineRows) {
  return {
    date:      sheetRow.sheet_date instanceof Date
                 ? sheetRow.sheet_date.toISOString().slice(0, 10)
                 : String(sheetRow.sheet_date).slice(0, 10),
    lines:     (lineRows || []).map(rowToLine),
    tolerance: FIXED_TOLERANCE,
    updatedAt: sheetRow.updated_at
                 ? (sheetRow.updated_at instanceof Date
                     ? sheetRow.updated_at.toISOString()
                     : String(sheetRow.updated_at))
                 : null,
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

/**
 * Return all sheets from Postgres in descending date order.
 * Returns: [{ date, lines[], tolerance, updatedAt }, ...]
 */
async function getAllSheets() {
  const sql = getSql();
  const sheets = await sql`
    SELECT * FROM production_sheets
    ORDER BY sheet_date DESC
  `;

  if (!sheets.length) return [];

  const sheetIds = sheets.map((s) => s.id);
  const lines = await sql`
    SELECT * FROM production_lines
    WHERE sheet_id = ANY(${sheetIds})
    ORDER BY sheet_date, created_at
  `;

  const linesBySheet = {};
  for (const line of lines) {
    const sid = String(line.sheet_id);
    if (!linesBySheet[sid]) linesBySheet[sid] = [];
    linesBySheet[sid].push(line);
  }

  return sheets.map((s) => buildSheet(s, linesBySheet[String(s.id)] || []));
}

/**
 * Return sheets for a specific date.
 * Returns: [{ date, lines[], tolerance, updatedAt }] (array with 0 or 1 element)
 */
async function getSheetsByDate(date) {
  const sql = getSql();
  const sheets = await sql`
    SELECT * FROM production_sheets
    WHERE sheet_date = ${date}::date
    LIMIT 1
  `;

  if (!sheets.length) {
    // Return an empty sheet so the frontend always gets a consistent shape
    return [{ date, lines: [], tolerance: FIXED_TOLERANCE, updatedAt: null }];
  }

  const sheetRow = sheets[0];
  const lines = await sql`
    SELECT * FROM production_lines
    WHERE sheet_id = ${sheetRow.id}
    ORDER BY created_at
  `;

  return [buildSheet(sheetRow, lines)];
}

/**
 * Return sheets for a date range (start + N days).
 * Returns: [{ date, lines[], tolerance, updatedAt }, ...] in chronological order.
 */
async function getSheetsByDateRange(startDate, days) {
  const sql = getSql();

  // Generate the date sequence in JS (matches the existing dateRange() in production.js)
  const dates = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const sheets = await sql`
    SELECT * FROM production_sheets
    WHERE sheet_date = ANY(${dates}::date[])
  `;

  if (!sheets.length) {
    return dates.map((d) => ({ date: d, lines: [], tolerance: FIXED_TOLERANCE, updatedAt: null }));
  }

  const sheetIds = sheets.map((s) => s.id);
  const lines = await sql`
    SELECT * FROM production_lines
    WHERE sheet_id = ANY(${sheetIds})
    ORDER BY sheet_date, created_at
  `;

  const sheetByDate = {};
  for (const s of sheets) {
    const d = s.sheet_date instanceof Date
      ? s.sheet_date.toISOString().slice(0, 10)
      : String(s.sheet_date).slice(0, 10);
    sheetByDate[d] = s;
  }

  const linesBySheet = {};
  for (const line of lines) {
    const sid = String(line.sheet_id);
    if (!linesBySheet[sid]) linesBySheet[sid] = [];
    linesBySheet[sid].push(line);
  }

  return dates.map((d) => {
    const s = sheetByDate[d];
    if (!s) return { date: d, lines: [], tolerance: FIXED_TOLERANCE, updatedAt: null };
    return buildSheet(s, linesBySheet[String(s.id)] || []);
  });
}

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Upsert a single sheet and all its lines.
 * Returns the saved sheet in the same shape as a read.
 */
async function saveSheet(sheet) {
  const sql = getSql();
  const { date, lines = [], updatedAt } = sheet;

  // Upsert production_sheets row
  const [sheetRow] = await sql`
    INSERT INTO production_sheets (sheet_date, tolerance, updated_at, source_app, source_version)
    VALUES (
      ${date}::date,
      ${FIXED_TOLERANCE},
      ${updatedAt || new Date().toISOString()}::timestamptz,
      ${SOURCE_APP},
      3
    )
    ON CONFLICT (sheet_date) DO UPDATE SET
      tolerance      = EXCLUDED.tolerance,
      updated_at     = EXCLUDED.updated_at,
      source_app     = EXCLUDED.source_app,
      source_version = EXCLUDED.source_version
    RETURNING *
  `;

  const sheetId = sheetRow.id;

  if (lines.length > 0) {
    // Delete lines that are no longer in the sheet (handles deletions)
    const incomingIds = lines.filter((l) => l && l.id).map((l) => l.id);

    if (incomingIds.length > 0) {
      await sql`
        DELETE FROM production_lines
        WHERE sheet_id = ${sheetId}
          AND id <> ALL(${incomingIds})
      `;
    } else {
      await sql`
        DELETE FROM production_lines WHERE sheet_id = ${sheetId}
      `;
    }

    // Upsert all lines one-by-one (Neon serverless doesn't support bulk upsert
    // with tagged templates easily, so we iterate — typically < 50 lines/sheet)
    for (const line of lines) {
      if (!line || !line.id) continue;
      const p = lineToParams(line, sheetId, date);
      await sql`
        INSERT INTO production_lines (
          id, sheet_id, sheet_date,
          machine, shift, item,
          cycle_time, cavity, hours, grammage, kg_per_bag, actual_bags,
          remark, from_calc,
          created_at, updated_at
        ) VALUES (
          ${p.id}, ${p.sheet_id}, ${p.sheet_date}::date,
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
      `;
    }
  } else {
    // No lines in incoming sheet — clear all lines for this sheet
    await sql`DELETE FROM production_lines WHERE sheet_id = ${sheetId}`;
  }

  // Return the saved sheet in the same shape as a read
  return buildSheet(sheetRow, lines);
}

/**
 * Bulk upsert sheets (used by POST /api/production for backup imports).
 * Returns: { sheets: [...], imported: N }
 */
async function bulkSaveSheets(sheets) {
  const saved = [];
  for (const sheet of sheets) {
    try {
      const result = await saveSheet(sheet);
      saved.push(result);
    } catch (err) {
      console.error(`[production-db] Failed to save sheet ${sheet.date}:`, err.message);
    }
  }
  return { sheets: saved, imported: saved.length };
}

module.exports = {
  getAllSheets,
  getSheetsByDate,
  getSheetsByDateRange,
  saveSheet,
  bulkSaveSheets,
};
