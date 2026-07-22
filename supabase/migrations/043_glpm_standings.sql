-- Materialized GLPM league standings with previous-rank movement for UI arrows.
-- Updated by /api/cron/glpm-standings-refresh (and future GitHub Actions) after
-- match score ingest so rank deltas stay stable across no-op refreshes.

CREATE TABLE IF NOT EXISTS glpm_standings_current (
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id) ON DELETE CASCADE,
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id) ON DELETE CASCADE,
  rank int NOT NULL,
  previous_rank int,
  played int NOT NULL DEFAULT 0,
  won int NOT NULL DEFAULT 0,
  drawn int NOT NULL DEFAULT 0,
  lost int NOT NULL DEFAULT 0,
  goals_for int NOT NULL DEFAULT 0,
  goals_against int NOT NULL DEFAULT 0,
  goal_difference int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0,
  form text[] NOT NULL DEFAULT '{}'::text[],
  results_fingerprint text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, team_sm_id),
  CONSTRAINT glpm_standings_current_rank_positive CHECK (rank >= 1),
  CONSTRAINT glpm_standings_current_previous_rank_positive
    CHECK (previous_rank IS NULL OR previous_rank >= 1)
);

CREATE INDEX IF NOT EXISTS idx_glpm_standings_current_season_rank
  ON glpm_standings_current (season_id, rank);

CREATE INDEX IF NOT EXISTS idx_glpm_standings_current_fingerprint
  ON glpm_standings_current (season_id, results_fingerprint);

COMMENT ON TABLE glpm_standings_current IS
  'Latest computed league table per season; previous_rank powers UI movement arrows.';

COMMENT ON COLUMN glpm_standings_current.previous_rank IS
  'Rank before the last results_fingerprint change; null on first snapshot or new team.';

COMMENT ON COLUMN glpm_standings_current.results_fingerprint IS
  'Hash of finished match scores for the season; unchanged fingerprint keeps previous_rank.';

CREATE TABLE IF NOT EXISTS glpm_standings_snapshots (
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  trigger text NOT NULL DEFAULT 'refresh',
  results_fingerprint text NOT NULL,
  rows jsonb NOT NULL,
  PRIMARY KEY (season_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_glpm_standings_snapshots_season
  ON glpm_standings_snapshots (season_id, snapshot_at DESC);

COMMENT ON TABLE glpm_standings_snapshots IS
  'Optional history of standings refreshes (cron / github / manual) for audit and debug.';
