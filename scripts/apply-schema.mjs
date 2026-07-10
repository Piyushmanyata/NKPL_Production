#!/usr/bin/env node
/**
 * scripts/apply-schema.mjs
 *
 * Applies db/schema.sql to Neon Postgres, one statement at a time.
 * Safe to re-run (all DDL uses IF NOT EXISTS / CREATE OR REPLACE).
 *
 * Usage:
 *   node scripts/apply-schema.mjs
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

// ── Hard-coded statement list (avoids complex SQL parsing) ───────────────────
// Splitting the schema file reliably is tricky. Instead we execute each
// well-known statement explicitly so there is no ambiguity.
const { neon } = (await import("@neondatabase/serverless"));
const sql = neon(DATABASE_URL);

const displayUrl = DATABASE_URL.replace(/:([^@:]+)@/, ":****@");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  NKPL Production — Apply Schema");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Database : ${displayUrl}`);
console.log();

async function exec(label, fn) {
  process.stdout.write(`  ⏳  ${label}... `);
  try {
    await fn();
    console.log("✅");
    return true;
  } catch (err) {
    console.log(`❌  ${err.message.slice(0, 100)}`);
    return false;
  }
}

let ok = 0, failed = 0;

function track(success) { if (success) ok++; else failed++; }

// 1. production_sheets table
track(await exec("CREATE TABLE production_sheets", () => sql`
  CREATE TABLE IF NOT EXISTS production_sheets (
    id             BIGSERIAL    PRIMARY KEY,
    sheet_date     DATE         UNIQUE NOT NULL,
    tolerance      NUMERIC(10,3),
    updated_at     TIMESTAMPTZ,
    source_app     TEXT,
    source_version INT,
    created_at     TIMESTAMPTZ  DEFAULT NOW()
  )
`));

// 2. production_lines table
track(await exec("CREATE TABLE production_lines", () => sql`
  CREATE TABLE IF NOT EXISTS production_lines (
    id             TEXT         NOT NULL,
    sheet_id       BIGINT       REFERENCES production_sheets(id) ON DELETE CASCADE,
    sheet_date     DATE         NOT NULL,
    machine        TEXT         NOT NULL,
    shift          TEXT         NOT NULL,
    item           TEXT         NOT NULL,
    cycle_time     NUMERIC(10,3),
    cavity         INT,
    hours          NUMERIC(10,3),
    grammage       NUMERIC(10,3),
    kg_per_bag     NUMERIC(10,3),
    actual_bags    NUMERIC(10,3),
    remark         TEXT,
    from_calc      BOOLEAN,
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  DEFAULT NOW()
  )
`));

// A line ID identifies a row inside a daily sheet, not across all history.
// This migration is metadata-only and prevents an imported/retried ID from
// moving a line from one date into another.
track(await exec("MIGRATE production_lines primary key", () => sql`
  DO $$
  DECLARE existing_key TEXT;
  DECLARE existing_definition TEXT;
  BEGIN
    SELECT conname, pg_get_constraintdef(oid) INTO existing_key, existing_definition
    FROM pg_constraint
    WHERE conrelid = 'production_lines'::regclass AND contype = 'p';
    IF existing_key IS NOT NULL AND existing_definition <> 'PRIMARY KEY (sheet_date, id)' THEN
      EXECUTE format('ALTER TABLE production_lines DROP CONSTRAINT %I', existing_key);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'production_lines'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) = 'PRIMARY KEY (sheet_date, id)'
    ) THEN
      ALTER TABLE production_lines ADD CONSTRAINT production_lines_pkey PRIMARY KEY (sheet_date, id);
    END IF;
  END $$
`));

// 3. Indexes — only sheet_date is indexed (see db/schema.sql for why).
track(await exec("CREATE INDEX idx_production_lines_date", () => sql`
  CREATE INDEX IF NOT EXISTS idx_production_lines_date ON production_lines(sheet_date)
`));

// Drop legacy unused indexes from earlier schema versions, if present —
// machine/item/shift are only ever filtered client-side, never in SQL, so
// these indexes were pure write amplification (extra WAL per line upsert).
track(await exec("DROP INDEX idx_production_lines_machine", () => sql`
  DROP INDEX IF EXISTS idx_production_lines_machine
`));

track(await exec("DROP INDEX idx_production_lines_item", () => sql`
  DROP INDEX IF EXISTS idx_production_lines_item
`));

track(await exec("DROP INDEX idx_production_lines_shift", () => sql`
  DROP INDEX IF EXISTS idx_production_lines_shift
`));

// Storage tuning — keep dead-tuple bloat from accumulating between
// autovacuum runs given frequent small autosave upserts.
track(await exec("SET autovacuum tuning on production_sheets", () => sql`
  ALTER TABLE production_sheets SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05)
`));

track(await exec("SET autovacuum tuning on production_lines", () => sql`
  ALTER TABLE production_lines SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05)
`));

// 4. Analytics view (computed on every read — no analytics stored in tables)
track(await exec("CREATE VIEW production_line_metrics", () => sql`
  CREATE OR REPLACE VIEW production_line_metrics AS
  SELECT
    l.*,
    actual_bags * kg_per_bag AS actual_kg,
    CASE
      WHEN cycle_time > 0 AND cavity > 0 AND hours > 0
      THEN (hours * 3600.0 / cycle_time) * cavity
      ELSE NULL
    END AS target_pieces,
    CASE
      WHEN cycle_time > 0 AND cavity > 0 AND hours > 0 AND grammage > 0
      THEN ((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0
      ELSE NULL
    END AS target_kg,
    CASE
      WHEN cycle_time > 0 AND cavity > 0 AND hours > 0 AND grammage > 0 AND kg_per_bag > 0
      THEN (((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0) / kg_per_bag
      ELSE NULL
    END AS target_bags,
    CASE
      WHEN cycle_time > 0 AND cavity > 0 AND hours > 0 AND grammage > 0 AND kg_per_bag > 0 AND actual_bags >= 0
      THEN (
        (actual_bags * kg_per_bag)
        / NULLIF(((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0, 0)
      ) * 100.0
      ELSE NULL
    END AS efficiency_pct,
    CASE
      WHEN cycle_time <= 0 OR cavity <= 0 OR hours <= 0 OR grammage <= 0 OR kg_per_bag <= 0 OR actual_bags < 0 OR actual_bags IS NULL THEN 'invalid'
      WHEN actual_bags - (((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0) / kg_per_bag > 1.5 THEN 'over'
      WHEN actual_bags - (((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0) / kg_per_bag < -1.5 THEN 'under'
      ELSE 'ok'
    END AS status
  FROM production_lines l
`));

// Routine schema changes must not take an exclusive rewrite lock. If storage
// reclamation is needed, schedule VACUUM FULL separately during downtime.

// ── Verify ────────────────────────────────────────────────────────────────────
console.log();

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('production_sheets', 'production_lines')
  ORDER BY table_name
`;

const views = await sql`
  SELECT table_name FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name = 'production_line_metrics'
`;

const indexes = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'production_lines'
    AND indexname LIKE 'idx_%'
  ORDER BY indexname
`;

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(failed === 0 ? "  ✅  Schema applied" : `  ⚠️   ${failed} statement(s) failed`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Tables  :", tables.map((t) => t.table_name).join(", ") || "none");
console.log("  Views   :", views.map((v) => v.table_name).join(", ")  || "none");
console.log("  Indexes :", indexes.map((i) => i.indexname).join(", ") || "none");
console.log();

if (failed > 0) process.exit(1);

console.log("  Next step (optional):");
console.log("  node scripts/backup-postgres.mjs");
