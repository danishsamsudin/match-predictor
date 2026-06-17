-- World Cup 2026 full-tournament model forecast (deterministic + optional Monte Carlo)

BEGIN;

CREATE TABLE IF NOT EXISTS world_cup_tournament_projection (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  mode TEXT NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB NOT NULL
);

ALTER TABLE world_cup_tournament_projection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_cup_tournament_projection_read"
  ON world_cup_tournament_projection
  FOR SELECT
  USING (true);

COMMIT;
