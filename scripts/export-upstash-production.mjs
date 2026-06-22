#!/usr/bin/env node
/**
 * scripts/export-upstash-production.mjs
 *
 * Reads ALL production data from Upstash and saves a timestamped JSON backup.
 *
 * Usage:
 *   node scripts/export-upstash-production.mjs
 *
 * Requires (in .env.local or environment):
 *   KV_REST_API_URL
 *   KV_REST_API_TOKEN
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

try {
  const envPath = join(ROOT, ".env.local");
  const raw = readFileSync(envPath, "utf8");
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
} catch {
  // env.local missing — rely on environment already being set
}

// ── Upstash REST helper ──────────────────────────────────────────────────────
const UPSTASH_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error("❌  Missing KV_REST_API_URL / KV_REST_API_TOKEN in environment.");
  process.exit(1);
}

async function redis(command) {
  const base = UPSTASH_URL.replace(/\/$/, "");
  const [op, key, value] = command;
  let url;
  const opts = { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } };

  if (op.toLowerCase() === "get") {
    url = `${base}/get/${encodeURIComponent(key)}`;
    opts.method = "GET";
  } else if (op.toLowerCase() === "set") {
    url = `${base}/set/${encodeURIComponent(key)}`;
    opts.method = "POST";
    opts.body = value;
  } else {
    url = `${base}/${command.map(encodeURIComponent).join("/")}`;
  }

  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Upstash ${op} failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.result;
}

// ── Constants ────────────────────────────────────────────────────────────────
const INDEX_KEY      = "nkpl:production:index";
const PREFIX         = "nkpl:production:";
const FIXED_TOLERANCE = 1.5;

// ── Main ─────────────────────────────────────────────────────────────────────
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Upstash Export");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Upstash URL : ${UPSTASH_URL}`);
console.log(`  Index key   : ${INDEX_KEY}`);
console.log();

// 1. Read index
const rawIndex = await redis(["get", INDEX_KEY]);
let dates = [];
try {
  const parsed = JSON.parse(rawIndex || "[]");
  dates = Array.isArray(parsed) ? parsed.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
} catch {
  dates = [];
}
dates.sort();

console.log(`  📅  Found ${dates.length} date(s) in index`);
if (dates.length === 0) {
  console.log("  ⚠️   No data found in Upstash index. Exiting.");
  process.exit(0);
}

// 2. Fetch each sheet
console.log("  ⏳  Fetching sheets...");
const rawValues = await Promise.all(dates.map((d) => redis(["get", PREFIX + d])));

const sheets = dates.map((date, i) => {
  try {
    const parsed = rawValues[i] ? JSON.parse(rawValues[i]) : {};
    return {
      date,
      lines:     Array.isArray(parsed.lines) ? parsed.lines : [],
      tolerance: FIXED_TOLERANCE,
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return { date, lines: [], tolerance: FIXED_TOLERANCE, updatedAt: null };
  }
}).filter((s) => s.lines.length > 0);

const totalLines = sheets.reduce((sum, s) => sum + s.lines.length, 0);

// 3. Build backup payload
const now = new Date();
const ts  = now.toISOString()
  .replace("T", "-")
  .replace(/:/g, "")
  .slice(0, 15); // YYYY-MM-DD-HHMM

const backup = {
  app:         "nkpl-production",
  version:     3,
  exportedAt:  now.toISOString(),
  source:      "upstash",
  indexKey:    INDEX_KEY,
  sheetPrefix: PREFIX,
  sheets,
};

// 4. Save to data/
const dataDir = join(ROOT, "data");
mkdirSync(dataDir, { recursive: true });

const filename = `upstash-production-backup-${ts}.json`;
const filepath = join(dataDir, filename);
writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf8");

const fileSizeKb = (readFileSync(filepath).length / 1024).toFixed(1);

// 5. Print summary
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  ✅  Export complete");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Key name    : ${INDEX_KEY}`);
console.log(`  Sheets      : ${sheets.length}`);
console.log(`  Lines       : ${totalLines}`);
console.log(`  File size   : ${fileSizeKb} KB`);
console.log(`  Saved to    : data/${filename}`);
console.log(`  Exported at : ${now.toISOString()}`);
console.log();
console.log("  Next step:");
console.log(`  node scripts/apply-schema.mjs`);
console.log(`  node scripts/migrate-production-json-to-postgres.mjs data/${filename}`);
