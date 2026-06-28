-- Daily prediction snapshots for World Cup hub + league fixtures (time-series history)

BEGIN;

CREATE TABLE IF NOT EXISTS prediction_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  domain text NOT NULL CHECK (domain IN ('world_cup', 'league')),
  match_key text NOT NULL,
  competition text,
  league_id int,
  season int,
  match_kickoff_at timestamptz NOT NULL,
  home_team_id text NOT NULL,
  away_team_id text NOT NULL,
  home_team_name text,
  away_team_name text,
  venue_city text,
  home_win_pct numeric(8, 4) NOT NULL,
  draw_pct numeric(8, 4) NOT NULL,
  away_win_pct numeric(8, 4) NOT NULL,
  predicted_score_home int,
  predicted_score_away int,
  home_xg numeric(6, 3),
  away_xg numeric(6, 3),
  under_2_5_pct numeric(8, 4),
  over_2_5_pct numeric(8, 4),
  model_version text NOT NULL,
  entity_type text NOT NULL DEFAULT 'club',
  source text NOT NULL DEFAULT 'cron_daily',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  analytics_snapshot jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, domain, match_key)
);

CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_match_date
  ON prediction_snapshots (match_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_domain_date
  ON prediction_snapshots (domain, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_kickoff
  ON prediction_snapshots (match_kickoff_at ASC);

CREATE TABLE IF NOT EXISTS prediction_snapshot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  domain text NOT NULL CHECK (domain IN ('world_cup', 'league', 'all')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  fixtures_attempted int NOT NULL DEFAULT 0,
  snapshots_written int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_prediction_snapshot_runs_date
  ON prediction_snapshot_runs (snapshot_date DESC, domain);

ALTER TABLE prediction_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_snapshot_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prediction_snapshots'
      AND policyname = 'prediction_snapshots_select_public'
  ) THEN
    CREATE POLICY prediction_snapshots_select_public
      ON prediction_snapshots FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prediction_snapshot_runs'
      AND policyname = 'prediction_snapshot_runs_select_public'
  ) THEN
    CREATE POLICY prediction_snapshot_runs_select_public
      ON prediction_snapshot_runs FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE prediction_snapshots IS
  'One row per match per UTC snapshot_date. Probabilities stored as fractions 0–1.';

COMMIT;
