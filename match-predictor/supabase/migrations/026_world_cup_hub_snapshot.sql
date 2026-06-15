-- Precomputed World Cup hub page payload (read path) + refresh metadata

BEGIN;

CREATE TABLE IF NOT EXISTS world_cup_hub_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  refresh_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (refresh_status IN ('idle', 'running', 'failed')),
  last_manual_refresh_at TIMESTAMPTZ,
  last_cron_refresh_at TIMESTAMPTZ,
  refresh_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE world_cup_hub_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_cup_hub_snapshot_read"
  ON world_cup_hub_snapshot
  FOR SELECT
  USING (true);

COMMIT;
