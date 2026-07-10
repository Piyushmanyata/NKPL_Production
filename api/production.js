"use strict";
/**
 * api/production.js
 * NKPL Production API — Vercel Serverless Function
 *
 * Single datastore: Neon Postgres. See api/lib/production-db.js for the
 * data layer and db/schema.sql for the table/view definitions.
 */

const FIXED_TOLERANCE = 1.5;
const MAX_RANGE_DAYS = 31;

let _db = null;
function getDb() {
  if (!_db) _db = require("./lib/production-db");
  return _db;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    // ── GET ──────────────────────────────────────────────────────────────
    if (req.method === "GET") {

      if (req.query.health === "1") {
        const { ping } = require("./lib/neon");
        await ping();
        return res.json({ status: "ok" });
      }

      if (req.query.all === "1") {
        const sheets = await getDb().getAllSheets();
        return res.json({ sheets });
      }

      const start = req.query.start || req.query.date;
      const days  = Math.min(Math.max(Number(req.query.days) || 1, 1), MAX_RANGE_DAYS);
      if (!getDb().isValidDate(start)) return res.status(400).json({ error: "A valid date is required" });

      const sheets = await getDb().getSheetsByDateRange(start, days);
      return res.json({ sheets });
    }

    // ── PUT (save one sheet) ──────────────────────────────────────────────
    if (req.method === "PUT") {
      const { date, lines, expectedUpdatedAt } = req.body || {};
      const sheet = { date, lines, expectedUpdatedAt, tolerance: FIXED_TOLERANCE };

      const savedSheet = await getDb().saveSheet(sheet);
      return res.json(savedSheet);
    }

    // ── POST (bulk import / restore backup) ────────────────────────────────
    if (req.method === "POST") {
      const { sheets } = req.body || {};
      const result = await getDb().bulkSaveSheets(sheets);
      return res.json({ sheets: result.sheets, imported: result.imported });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (error) {
    console.error("[api/production] Unhandled error:", error.message);
    const status = error.statusCode || 503;
    return res.status(status).json({ error: status >= 500 ? "Service unavailable" : error.message });
  }
};
