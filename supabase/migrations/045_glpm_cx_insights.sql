-- GLPM-CX insights: prediction archive, event-stat columns, season sim runs.

-- ---------------------------------------------------------------------------
-- CX prediction history (parallel to glpm_prediction_history; never write CX into base)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_cx_prediction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_sm_id bigint REFERENCES glpm_matches (sm_id) ON DELETE SET NULL,
  home_team_sm_id bigint REFERENCES glpm_teams (sm_id),
  away_team_sm_id bigint REFERENCES glpm_teams (sm_id),
  season_id bigint REFERENCES glpm_seasons (sm_id),
  base_home_xg numeric(6, 4) NOT NULL,
  base_away_xg numeric(6, 4) NOT NULL,
  home_xg numeric(6, 4) NOT NULL,
  away_xg numeric(6, 4) NOT NULL,
  home_win_pct numeric(8, 6) NOT NULL,
  draw_pct numeric(8, 6) NOT NULL,
  away_win_pct numeric(8, 6) NOT NULL,
  btts_yes_pct numeric(8, 6) NOT NULL,
  btts_no_pct numeric(8, 6) NOT NULL,
  over_under jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_matrix jsonb NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  rho numeric(8, 6) NOT NULL DEFAULT -0.13,
  model_version text NOT NULL DEFAULT 'glpm_cx_v1',
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_cx_prediction_history_match
  ON glpm_cx_prediction_history (match_sm_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_cx_prediction_history_executed
  ON glpm_cx_prediction_history (executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_cx_prediction_history_teams
  ON glpm_cx_prediction_history (home_team_sm_id, away_team_sm_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_cx_prediction_history_season
  ON glpm_cx_prediction_history (season_id, executed_at DESC);

COMMENT ON TABLE glpm_cx_prediction_history IS
  'GLPM-CX contextual extension prediction archive (base xG + adjusted markets + breakdown).';

-- ---------------------------------------------------------------------------
-- Event-market columns on team match stats (corners / cards / fouls)
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_match_team_stats
  ADD COLUMN IF NOT EXISTS corners int,
  ADD COLUMN IF NOT EXISTS yellow_cards int,
  ADD COLUMN IF NOT EXISTS red_cards int,
  ADD COLUMN IF NOT EXISTS fouls int;

-- ---------------------------------------------------------------------------
-- Season Monte Carlo run summaries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_cx_season_sim_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id) ON DELETE CASCADE,
  model_source text NOT NULL DEFAULT 'glpm_cx',
  iterations int NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_cx_season_sim_runs_season
  ON glpm_cx_season_sim_runs (season_id, executed_at DESC);

COMMENT ON TABLE glpm_cx_season_sim_runs IS
  'Optional archive of GLPM-CX season Monte Carlo outright simulations.';

-- ---------------------------------------------------------------------------
-- RLS (anon/authenticated select - matches glpm table pattern from 031/038 era)
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_cx_prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_cx_season_sim_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'glpm_cx_prediction_history',
    'glpm_cx_season_sim_runs'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)',
        t || '_select',
        t
      );
    END IF;
  END LOOP;
END $$;
