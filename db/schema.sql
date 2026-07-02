-- ============================================================
-- NKPL Production Database Schema
-- Neon Postgres (serverless) — sole datastore for production data
-- ============================================================

-- ── Production Sheets ────────────────────────────────────────
-- One row per production date.
CREATE TABLE IF NOT EXISTS production_sheets (
  id             BIGSERIAL    PRIMARY KEY,
  sheet_date     DATE         UNIQUE NOT NULL,
  tolerance      NUMERIC(10,3),
  updated_at     TIMESTAMPTZ,
  source_app     TEXT,
  source_version INT,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Production Lines ─────────────────────────────────────────
-- One row per production entry (machine/shift/item combination).
-- id matches the client-generated uid() from app.js (e.g. "p1a2b3c4d5").
CREATE TABLE IF NOT EXISTS production_lines (
  id             TEXT         PRIMARY KEY,
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
);

-- ── Indexes ──────────────────────────────────────────────────
-- Only sheet_date is indexed: it's the sole column the app ever filters or
-- deletes by (saveSheet's stale-line cleanup). machine/item/shift are only
-- ever filtered client-side after fetch, so indexing them here would just
-- be write amplification (extra WAL + index pages) with no read benefit.
CREATE INDEX IF NOT EXISTS idx_production_lines_date ON production_lines(sheet_date);

-- ── Storage tuning ───────────────────────────────────────────
-- These two tables see frequent small upserts (autosave every ~500ms of
-- inactivity). Lower autovacuum thresholds keep dead-tuple bloat from
-- accumulating between autovacuum runs, which keeps disk usage flat over
-- time instead of growing until the default 20%-dead-tuples threshold fires.
ALTER TABLE production_sheets SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE production_lines  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);

-- ── Analytics View ───────────────────────────────────────────
-- Computes target_bags, target_kg, target_pieces, efficiency_pct, and status
-- from raw production_lines columns. Reads use this view; no analytics stored.
CREATE OR REPLACE VIEW production_line_metrics AS
SELECT
  l.*,

  -- Actual kg produced
  actual_bags * kg_per_bag                                                           AS actual_kg,

  -- Target pieces (cycle-time formula)
  CASE
    WHEN cycle_time > 0
    THEN (hours * 3600.0 / cycle_time) * cavity
    ELSE NULL
  END                                                                                AS target_pieces,

  -- Target kg
  CASE
    WHEN cycle_time > 0
    THEN ((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0
    ELSE NULL
  END                                                                                AS target_kg,

  -- Target bags = target_kg / kg_per_bag
  CASE
    WHEN cycle_time > 0 AND kg_per_bag > 0
    THEN (((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0) / kg_per_bag
    ELSE NULL
  END                                                                                AS target_bags,

  -- Efficiency %
  CASE
    WHEN cycle_time > 0
    THEN (
      (actual_bags * kg_per_bag)
      /
      NULLIF(((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0, 0)
    ) * 100.0
    ELSE NULL
  END                                                                                AS efficiency_pct,

  -- Status (tolerance = 1.5 bags, same as app constant FIXED_TOLERANCE)
  CASE
    WHEN cycle_time <= 0 THEN 'invalid'
    WHEN (
      (actual_bags * kg_per_bag)
      /
      NULLIF(((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0, 0)
    ) * 100.0 >= 101.5 THEN 'over'
    WHEN (
      (actual_bags * kg_per_bag)
      /
      NULLIF(((hours * 3600.0 / cycle_time) * cavity * grammage) / 1000.0, 0)
    ) * 100.0 <= 98.5 THEN 'under'
    ELSE 'ok'
  END                                                                                AS status

FROM production_lines l;
