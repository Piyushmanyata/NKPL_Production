const PREFIX = "nkpl:production:";
const INDEX_KEY = "nkpl:production:index";
const FIXED_TOLERANCE = 1.5;

async function redis(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Shared database is not configured");
  const response = await fetch(`${url}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Database request failed: ${response.status}`);
  const body = await response.json();
  return body.result;
}

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
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      tolerance: FIXED_TOLERANCE,
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return {
      date,
      lines: [],
      tolerance: FIXED_TOLERANCE,
      updatedAt: null,
    };
  }
}

async function readIndex() {
  return parseIndex(await redis(["get", INDEX_KEY]));
}

async function writeIndex(dates) {
  await redis(["set", INDEX_KEY, JSON.stringify(uniqueSortedDates(dates))]);
}

async function upsertSheet(sheet) {
  await redis(["set", PREFIX + sheet.date, JSON.stringify(sheet)]);
  const index = await readIndex();
  const next = new Set(index);
  if (sheetHasContent(sheet.lines)) next.add(sheet.date);
  else next.delete(sheet.date);
  await writeIndex(Array.from(next));
  return sheet;
}

function dateRange(start, days) {
  const current = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: days }, () => {
    const value = current.toISOString().slice(0, 10);
    current.setUTCDate(current.getUTCDate() + 1);
    return value;
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      if (req.query.all === "1") {
        const dates = uniqueSortedDates(await readIndex()).reverse();
        const values = await Promise.all(dates.map((date) => redis(["get", PREFIX + date])));
        return res.json({
          sheets: dates.map((date, index) => parseSheet(date, values[index])),
        });
      }

      const start = req.query.start || req.query.date;
      const days = Math.min(Math.max(Number(req.query.days) || 1, 1), 31);
      if (!validDate(start)) return res.status(400).json({ error: "A valid date is required" });
      const dates = dateRange(start, days);
      const values = await Promise.all(dates.map((date) => redis(["get", PREFIX + date])));
      return res.json({
        sheets: dates.map((date, index) => {
          return parseSheet(date, values[index]);
        }),
      });
    }

    if (req.method === "PUT") {
      const { date, lines } = req.body || {};
      if (!validDate(date) || !Array.isArray(lines)) return res.status(400).json({ error: "Invalid daily sheet" });
      const sheet = { date, lines, tolerance: FIXED_TOLERANCE, updatedAt: new Date().toISOString() };
      await upsertSheet(sheet);
      return res.json(sheet);
    }

    if (req.method === "POST") {
      const { sheets } = req.body || {};
      if (!Array.isArray(sheets)) return res.status(400).json({ error: "Invalid backup payload" });
      const cleaned = sheets
        .filter((sheet) => sheet && validDate(sheet.date) && Array.isArray(sheet.lines))
        .map((sheet) => ({
          date: sheet.date,
          lines: sheet.lines,
          tolerance: FIXED_TOLERANCE,
          updatedAt: sheet.updatedAt || new Date().toISOString(),
        }));
      await Promise.all(cleaned.map((sheet) => redis(["set", PREFIX + sheet.date, JSON.stringify(sheet)])));
      const index = await readIndex();
      const next = new Set(index);
      cleaned.forEach((sheet) => {
        if (sheetHasContent(sheet.lines)) next.add(sheet.date);
        else next.delete(sheet.date);
      });
      await writeIndex(Array.from(next));
      return res.json({ sheets: cleaned, imported: cleaned.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
};
