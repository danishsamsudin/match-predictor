-- GLPM Layer 4 Prediction History (Chapter 2.12 / Chapter 12)
-- Archives every Match Prediction Models run: xG, 1X2, BTTS, O/U, score matrix.

CREATE TABLE IF NOT EXISTS glpm_prediction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_sm_id bigint REFERENCES glpm_matches (sm_id) ON DELETE SET NULL,
  home_team_sm_id bigint REFERENCES glpm_teams (sm_id),
  away_team_sm_id bigint REFERENCES glpm_teams (sm_id),
  season_id bigint REFERENCES glpm_seasons (sm_id),
  home_xg numeric(6, 4) NOT NULL,
  away_xg numeric(6, 4) NOT NULL,
  home_win_pct numeric(8, 6) NOT NULL,
  draw_pct numeric(8, 6) NOT NULL,
  away_win_pct numeric(8, 6) NOT NULL,
  btts_yes_pct numeric(8, 6) NOT NULL,
  btts_no_pct numeric(8, 6) NOT NULL,
  over_under jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_matrix jsonb NOT NULL,
  rho numeric(8, 6) NOT NULL DEFAULT -0.13,
  model_version text NOT NULL DEFAULT 'glpm_pred_v1',
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_prediction_history_match
  ON glpm_prediction_history (match_sm_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_prediction_history_executed
  ON glpm_prediction_history (executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_prediction_history_teams
  ON glpm_prediction_history (home_team_sm_id, away_team_sm_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_prediction_history_season
  ON glpm_prediction_history (season_id, executed_at DESC);

COMMENT ON TABLE glpm_prediction_history IS
  'GLPM Layer 4 archive of Dixon–Coles match predictions (Chapter 12).';
