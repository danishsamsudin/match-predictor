-- Nations League match-market learning: prediction evaluations, market evaluations,
-- ML training examples, and richer player-prop evaluation features.

BEGIN;

-- Scored locked match predictions (home/draw/away, scoreline, over/under, both teams to score, handicaps)
CREATE TABLE IF NOT EXISTS nations_league_prediction_evaluations (
  match_id text PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
  model_version text NOT NULL,
  calibration_version text,
  actual_score_home int NOT NULL,
  actual_score_away int NOT NULL,
  market_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_prediction_eval_computed
  ON nations_league_prediction_evaluations (computed_at DESC);

-- Per-market head losses (kept separate from world_cup / ml_market_evaluations
-- so Nations League calibration never trains on World Cup rows).
CREATE TABLE IF NOT EXISTS nations_league_market_evaluations (
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  market_id text NOT NULL,
  market_key text NOT NULL DEFAULT '',
  predicted jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  loss_metric text NOT NULL,
  loss_value numeric(12, 6) NOT NULL,
  model_version text NOT NULL,
  match_date date,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, market_id, market_key)
);

CREATE INDEX IF NOT EXISTS idx_nl_market_eval_market
  ON nations_league_market_evaluations (market_id, computed_at DESC);

-- Frozen snapshot features + outcomes for the Nations League machine-learning step.
CREATE TABLE IF NOT EXISTS nations_league_ml_training_examples (
  match_id text PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
  match_date date NOT NULL,
  competition text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  opta_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  process_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_home_goals int,
  actual_away_goals int,
  source text NOT NULL DEFAULT 'nl_prediction_snapshot',
  feature_as_of timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_ml_training_date
  ON nations_league_ml_training_examples (match_date ASC);

-- Honest training features for player markets (previously hardcoded at calibrate time).
ALTER TABLE nations_league_player_prop_evaluations
  ADD COLUMN IF NOT EXISTS line numeric(4, 1),
  ADD COLUMN IF NOT EXISTS chance_index_per90 numeric(8, 4),
  ADD COLUMN IF NOT EXISTS is_penalty_taker boolean,
  ADD COLUMN IF NOT EXISTS is_starter boolean,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS team_expected_goals numeric(8, 4),
  ADD COLUMN IF NOT EXISTS team_expected_sot numeric(8, 4),
  ADD COLUMN IF NOT EXISTS sot_rate_per90 numeric(8, 4),
  ADD COLUMN IF NOT EXISTS prop_source text,
  ADD COLUMN IF NOT EXISTS match_date date;

ALTER TABLE nations_league_prediction_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_market_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_ml_training_examples ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_prediction_evaluations'
      AND policyname = 'nations_league_prediction_evaluations_select_public'
  ) THEN
    CREATE POLICY nations_league_prediction_evaluations_select_public
      ON nations_league_prediction_evaluations FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_market_evaluations'
      AND policyname = 'nations_league_market_evaluations_select_public'
  ) THEN
    CREATE POLICY nations_league_market_evaluations_select_public
      ON nations_league_market_evaluations FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_ml_training_examples'
      AND policyname = 'nations_league_ml_training_examples_select_public'
  ) THEN
    CREATE POLICY nations_league_ml_training_examples_select_public
      ON nations_league_ml_training_examples FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
