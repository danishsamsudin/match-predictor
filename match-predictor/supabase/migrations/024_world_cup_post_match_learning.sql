-- World Cup 2026 post-match learning: calibration, ingests, evaluations

BEGIN;

CREATE TABLE IF NOT EXISTS world_cup_calibration_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  effective_from timestamptz NOT NULL DEFAULT now(),
  constants jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc_calibration_effective
  ON world_cup_calibration_config (effective_from DESC);

CREATE TABLE IF NOT EXISTS world_cup_post_match_ingests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES matches (id),
  source_path text,
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  article_text text,
  narrative_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc_post_match_ingests_match
  ON world_cup_post_match_ingests (match_id, ingested_at DESC);

CREATE TABLE IF NOT EXISTS world_cup_prediction_evaluations (
  match_id text PRIMARY KEY REFERENCES matches (id),
  model_version text NOT NULL,
  calibration_version text,
  actual_score_home int NOT NULL,
  actual_score_away int NOT NULL,
  market_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS analytics_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS wc_match_id text;

CREATE INDEX IF NOT EXISTS idx_predictions_wc_match_id
  ON predictions (wc_match_id)
  WHERE wc_match_id IS NOT NULL;

ALTER TABLE world_cup_calibration_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_post_match_ingests ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_prediction_evaluations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'world_cup_calibration_config'
      AND policyname = 'world_cup_calibration_config_select_public'
  ) THEN
    CREATE POLICY world_cup_calibration_config_select_public
      ON world_cup_calibration_config FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'world_cup_post_match_ingests'
      AND policyname = 'world_cup_post_match_ingests_select_public'
  ) THEN
    CREATE POLICY world_cup_post_match_ingests_select_public
      ON world_cup_post_match_ingests FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'world_cup_prediction_evaluations'
      AND policyname = 'world_cup_prediction_evaluations_select_public'
  ) THEN
    CREATE POLICY world_cup_prediction_evaluations_select_public
      ON world_cup_prediction_evaluations FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
