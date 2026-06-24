-- Saved Model Squad predictions + player prop evaluations

BEGIN;

CREATE TABLE IF NOT EXISTS world_cup_model_squad_predictions (
  match_id text PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
  home_team_api_id int NOT NULL,
  away_team_api_id int NOT NULL,
  lineup_source text NOT NULL DEFAULT 'model_xi',
  model_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  team_prediction jsonb NOT NULL DEFAULT '{}'::jsonb,
  player_props jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_xi_meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS world_cup_player_prop_evaluations (
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  opta_player_id text NOT NULL,
  player_name text NOT NULL,
  team_api_id int NOT NULL,
  market text NOT NULL,
  predicted_lambda numeric(8, 4),
  predicted_prob numeric(8, 4),
  actual_count int,
  hit boolean,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, opta_player_id, market)
);

CREATE INDEX IF NOT EXISTS idx_wc_model_squad_pred_computed
  ON world_cup_model_squad_predictions (computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_wc_player_prop_eval_match
  ON world_cup_player_prop_evaluations (match_id);

ALTER TABLE world_cup_model_squad_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_player_prop_evaluations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_model_squad_predictions'
      AND policyname = 'world_cup_model_squad_predictions_select_public'
  ) THEN
    CREATE POLICY world_cup_model_squad_predictions_select_public
      ON world_cup_model_squad_predictions FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_player_prop_evaluations'
      AND policyname = 'world_cup_player_prop_evaluations_select_public'
  ) THEN
    CREATE POLICY world_cup_player_prop_evaluations_select_public
      ON world_cup_player_prop_evaluations FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
