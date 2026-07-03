-- Per-market ML evaluations and extended training labels for WC post-match learning

BEGIN;

ALTER TABLE ml_training_examples
  ADD COLUMN IF NOT EXISTS market_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS actual_red int;

CREATE TABLE IF NOT EXISTS ml_market_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES matches (id),
  market_id text NOT NULL,
  predicted jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  loss_metric text NOT NULL,
  loss_value double precision NOT NULL,
  model_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_ml_market_evaluations_market
  ON ml_market_evaluations (market_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_market_evaluations_match
  ON ml_market_evaluations (match_id);

ALTER TABLE ml_market_evaluations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ml_market_evaluations'
      AND policyname = 'ml_market_evaluations_select_public'
  ) THEN
    CREATE POLICY ml_market_evaluations_select_public
      ON ml_market_evaluations FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
