-- Precomputed GLPM home / league hub payloads (read path) + refresh metadata

BEGIN;

CREATE TABLE IF NOT EXISTS glpm_home_hub_snapshot (
  competition_sm_id BIGINT NOT NULL,
  season_sm_id BIGINT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('fixtures', 'ratings')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  refresh_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (refresh_status IN ('idle', 'running', 'failed')),
  refresh_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competition_sm_id, season_sm_id, kind)
);

CREATE INDEX IF NOT EXISTS glpm_home_hub_snapshot_computed_at_idx
  ON glpm_home_hub_snapshot (computed_at DESC);

ALTER TABLE glpm_home_hub_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "glpm_home_hub_snapshot_read" ON glpm_home_hub_snapshot;
CREATE POLICY "glpm_home_hub_snapshot_read"
  ON glpm_home_hub_snapshot
  FOR SELECT
  USING (true);

COMMIT;
