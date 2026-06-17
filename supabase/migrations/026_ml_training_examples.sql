-- ML training examples for World Cup hybrid learning pipeline

BEGIN;

CREATE TABLE IF NOT EXISTS ml_training_examples (
  match_id text PRIMARY KEY,
  match_date date NOT NULL,
  competition text,
  is_knockout boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  opta_features jsonb,
  actual_home_goals int,
  actual_away_goals int,
  actual_yellow int,
  actual_fouls int,
  actual_corners int,
  source text NOT NULL DEFAULT 'backfill',
  feature_as_of timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_training_examples_date
  ON ml_training_examples (match_date ASC);

CREATE INDEX IF NOT EXISTS idx_ml_training_examples_source
  ON ml_training_examples (source);

ALTER TABLE ml_training_examples ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ml_training_examples'
      AND policyname = 'ml_training_examples_select_public'
  ) THEN
    CREATE POLICY ml_training_examples_select_public
      ON ml_training_examples FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
