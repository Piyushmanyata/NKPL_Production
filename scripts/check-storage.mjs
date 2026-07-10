#!/usr/bin/env node
/**
 * scripts/check-storage.mjs
 *
 * Reports Neon Postgres storage usage: logical database size, per-table
 * size (data vs. index/TOAST), row counts, dead-tuple bloat, and last
 * vacuum times. Use this to sanity-check that storage stays small as data
 * grows, and to catch dead-tuple bloat before it accumulates.
 *
 * Usage:
 *   node scripts/check-storage.mjs
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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set.");
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Storage Report");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const [{ size: dbSize }] = await sql`
  SELECT pg_size_pretty(pg_database_size(current_database())) AS size
`;
console.log(`  Logical DB size : ${dbSize}`);
console.log("  (Neon's dashboard 'Storage' figure also includes WAL/history");
console.log("   retained for point-in-time restore — see Project Settings →");
console.log("   Backup/Restore in the Neon console to shrink that window.)");
console.log();

const tables = await sql`
  SELECT relname AS name,
         pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
         pg_size_pretty(pg_relation_size(relid))        AS table_size,
         pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_toast_size,
         n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
`;

console.log("  Tables:");
for (const t of tables) {
  console.log(`    ${t.name}`);
  console.log(`      total: ${t.total_size}  (table: ${t.table_size}, indexes/toast: ${t.index_toast_size})`);
  console.log(`      rows : ${t.n_live_tup} live, ${t.n_dead_tup} dead`);
  console.log(`      last autovacuum: ${t.last_autovacuum || "never"}`);
}
console.log();

const indexes = await sql`
  SELECT indexrelname, relname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_stat_user_indexes
  ORDER BY pg_relation_size(indexrelid) DESC
`;
console.log("  Indexes:");
for (const i of indexes) {
  console.log(`    ${i.indexrelname} (on ${i.relname}): ${i.size}`);
}
console.log();

const [{ sheets, lines }] = await sql`
  SELECT (SELECT COUNT(*) FROM production_sheets) AS sheets,
         (SELECT COUNT(*) FROM production_lines)  AS lines
`;
console.log(`  Sheets: ${sheets}   Lines: ${lines}`);
console.log();
console.log("  If dead-tuple counts are high, schedule VACUUM (ANALYZE) separately.");
console.log("  Reserve VACUUM FULL for planned downtime because it blocks writers.");
console.log();
