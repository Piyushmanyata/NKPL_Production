"use strict";
/**
 * api/production.js
 * NKPL Production API — Vercel Serverless Function
 *
 * Migration state: DUAL-WRITE (Neon primary, Upstash backup mirror)
 * ─────────────────────────────────────────────────────────────────
 * Reads:  Try Neon Postgres → fallback to Upstash if Postgres fails
 * Writes: Write to Neon Postgres first, then mirror to Upstash backup key
 *
 * Upstash data is NEVER deleted. The original key prefix is preserved.
 * After 7 clean days, Upstash writes can be removed (see MIGRATION STEP below).
 */

// ── Upstash Redis (original transport) ─────────────────────────────────────
const PREFIX = "nkpl:production:";
const INDEX_KEY = "nkpl:production:index";
const FIXED_TOLERANCE = 1.5;

async function upstashRedis(command) {
  const url   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Upstash database is not configured");

  const baseUrl = url.replace(/\/$/, "");
  const [op, key, value] = command;

  let fetchUrl;
  const options = { headers: { Authorization: `Bearer ${token}` } };

  if (op.toLowerCase() === "get") {
    fetchUrl = `${baseUrl}/get/${encodeURIComponent(key)}`;
    options.method = "GET";
  } else if (op.toLowerCase() === "set") {
    fetchUrl = `${baseUrl}/set/${encodeURIComponent(key)}`;
    options.method = "POST";
    options.body = value;
  } else {
    fetchUrl = `${baseUrl}/${command.map(encodeURIComponent).join("/")}`;
  }

  const response = await fetch(fetchUrl, options);
  if (!response.ok) throw new Error(`Upstash request failed: ${response.status}`);
  const body = await response.json();
  return body.result;
}

// ── Upstash helpers (kept intact for fallback reads and backup mirror) ──────

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function hasLineContent(line) {
  if (!line || typeof line !== "object") return false;
  return ["machine", "shift", "item", "cycleTime", "cavity", "hours", "grammage", "kgPerBag", "actualBags", "remark"].some((key) => {
    const value = line[key];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}

function sheetHasContent(lines) {
  return Array.isArray(lines) && lines.some(hasLineContent);
}

function parseIndex(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validDate);
  } catch {
    return [];
  }
}

function uniqueSortedDates(dates) {
  return Array.from(new Set((dates || []).filter(validDate))).sort();
}

function parseSheet(date, raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      date,
      lines:     Array.isArray(parsed.lines) ? parsed.lines : [],
      tolerance: FIXED_TOLERANCE,
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return { date, lines: [], tolerance: FIXED_TOLERANCE, updatedAt: null };
  }
}

async function upstashReadIndex() {
  return parseIndex(await upstashRedis(["get", INDEX_KEY]));
}

async function upstashWriteIndex(dates) {
  await upstashRedis(["set", INDEX_KEY, JSON.stringify(uniqueSortedDates(dates))]);
}

/**
 * Mirror a sheet to Upstash backup key.
 * MIGRATION: This keeps Upstash in sync for 7 days.
 * After verification, this function can be removed.
 */
async function mirrorToUpstash(sheet) {
  try {
    // Preserve history (same logic as original upsertSheet)
    const existingRaw = await upstashRedis(["get", PREFIX + sheet.date]);
    if (existingRaw) {
      try {
        const existingSheet = JSON.parse(existingRaw);
        if (sheetHasContent(existingSheet.lines) && existingRaw !== JSON.stringify(sheet)) {
          const historyKey = "nkpl:history:" + sheet.date;
          await upstashRedis(["lpush", historyKey, existingRaw]);
          await upstashRedis(["ltrim", historyKey, "0", "9"]);
        }
      } catch {
        // Ignore history errors — backup mirror only
      }
    }

    await upstashRedis(["set", PREFIX + sheet.date, JSON.stringify(sheet)]);

    const index = await upstashReadIndex();
    const next = new Set(index);
    if (sheetHasContent(sheet.lines)) next.add(sheet.date);
    else next.delete(sheet.date);
    await upstashWriteIndex(Array.from(next));

    console.log(`[migration] Upstash mirror updated: ${sheet.date}`);
  } catch (err) {
    // Upstash mirror failures MUST NOT fail the primary request
    console.error(`[migration] Upstash mirror failed for ${sheet.date}:`, err.message);
  }
}

/**
 * Mirror multiple sheets to Upstash (for bulk imports).
 */
async function mirrorBulkToUpstash(sheets) {
  for (const sheet of sheets) {
    await mirrorToUpstash(sheet);
  }
}

// ── Upstash fallback reads ──────────────────────────────────────────────────

function dateRange(start, days) {
  const current = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: days }, () => {
    const value = current.toISOString().slice(0, 10);
    current.setUTCDate(current.getUTCDate() + 1);
    return value;
  });
}

async function upstashGetAll() {
  const dates = uniqueSortedDates(await upstashReadIndex()).reverse();
  const values = await Promise.all(dates.map((date) => upstashRedis(["get", PREFIX + date])));
  return dates.map((date, i) => parseSheet(date, values[i]));
}

async function upstashGetRange(start, days) {
  const dates = dateRange(start, days);
  const values = await Promise.all(dates.map((date) => upstashRedis(["get", PREFIX + date])));
  return dates.map((date, i) => parseSheet(date, values[i]));
}

// ── Postgres data layer ─────────────────────────────────────────────────────

let _db = null;
function getDb() {
  if (!_db) _db = require("./lib/production-db");
  return _db;
}

// ── Handler ────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    // ── GET ──────────────────────────────────────────────────────────────
    if (req.method === "GET") {

      if (req.query.all === "1") {
        // Return all sheets (history panel)
        try {
          const sheets = await getDb().getAllSheets();
          console.log(`[postgres] getAllSheets → ${sheets.length} sheets`);
          return res.json({ sheets });
        } catch (pgErr) {
          console.error("[postgres] getAllSheets failed, falling back to Upstash:", pgErr.message);
          const sheets = await upstashGetAll();
          return res.json({ sheets });
        }
      }

      // Date range read
      const start = req.query.start || req.query.date;
      const days  = Math.min(Math.max(Number(req.query.days) || 1, 1), 31);
      if (!validDate(start)) return res.status(400).json({ error: "A valid date is required" });

      try {
        const sheets = await getDb().getSheetsByDateRange(start, days);
        console.log(`[postgres] getSheetsByDateRange(${start}, ${days}) → ${sheets.length} sheets`);
        return res.json({ sheets });
      } catch (pgErr) {
        console.error(`[postgres] getSheetsByDateRange failed, falling back to Upstash:`, pgErr.message);
        const sheets = await upstashGetRange(start, days);
        return res.json({ sheets });
      }
    }

    // ── PUT (save one sheet) ──────────────────────────────────────────────
    if (req.method === "PUT") {
      const { date, lines } = req.body || {};
      if (!validDate(date) || !Array.isArray(lines)) {
        return res.status(400).json({ error: "Invalid daily sheet" });
      }

      const sheet = {
        date,
        lines,
        tolerance: FIXED_TOLERANCE,
        updatedAt: new Date().toISOString(),
      };

      // Primary write: Neon Postgres
      let savedSheet;
      try {
        savedSheet = await getDb().saveSheet(sheet);
        console.log(`[postgres] saveSheet(${date}) OK — ${lines.length} lines`);
      } catch (pgErr) {
        console.error(`[postgres] saveSheet(${date}) FAILED:`, pgErr.message);
        throw pgErr; // Propagate — do not silently lose data
      }

      // MIGRATION: Mirror to Upstash backup (fire-and-forget, failures are logged)
      mirrorToUpstash(savedSheet);

      return res.json(savedSheet);
    }

    // ── POST (bulk import / restore backup) ────────────────────────────────
    if (req.method === "POST") {
      const { sheets } = req.body || {};
      if (!Array.isArray(sheets)) return res.status(400).json({ error: "Invalid backup payload" });

      const cleaned = sheets
        .filter((s) => s && validDate(s.date) && Array.isArray(s.lines))
        .map((s) => ({
          date:      s.date,
          lines:     s.lines,
          tolerance: FIXED_TOLERANCE,
          updatedAt: s.updatedAt || new Date().toISOString(),
        }));

      // Primary write: Neon Postgres
      let result;
      try {
        result = await getDb().bulkSaveSheets(cleaned);
        console.log(`[postgres] bulkSaveSheets OK — ${result.imported}/${cleaned.length} sheets`);
      } catch (pgErr) {
        console.error("[postgres] bulkSaveSheets FAILED:", pgErr.message);
        throw pgErr;
      }

      // MIGRATION: Mirror all imported sheets to Upstash (fire-and-forget)
      mirrorBulkToUpstash(result.sheets);

      return res.json({ sheets: result.sheets, imported: result.imported });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (error) {
    console.error("[api/production] Unhandled error:", error.message);
    return res.status(503).json({ error: error.message });
  }
};
