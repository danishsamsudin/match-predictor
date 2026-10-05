-- GLPM Value Opportunities: per-league market evaluations + confidence calibration.

BEGIN;

-- Locked CX market lines scored vs finished results (confidence teaching data).
CREATE TABLE IF NOT EXISTS glpm_market_evaluations (
  match_sm_id bigint NOT NULL REFERENCES glpm_matches (sm_id) ON DELETE CASCADE,
  league_sm_id bigint NOT NULL,
  market_id text NOT NULL,
  market_key text NOT NULL DEFAULT '',
  predicted jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  loss_metric text NOT NULL DEFAULT 'brier',
  loss_value numeric(12, 6) NOT NULL DEFAULT 0,
  model_version text NOT NULL,
  match_date date,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_sm_id, market_id, market_key)
);

CREATE INDEX IF NOT EXISTS idx_glpm_market_eval_league
  ON glpm_market_evaluations (league_sm_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_market_eval_market
  ON glpm_market_evaluations (market_id, computed_at DESC);

COMMENT ON TABLE glpm_market_evaluations IS
  'Per-market locked CX prediction vs result for GLPM Value Opportunities confidence layers (separate from NL/WC).';

-- Versioned calibration rows; one active confidence layer per SportMonks league.
CREATE TABLE IF NOT EXISTS glpm_calibration_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_sm_id bigint NOT NULL,
  version text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  constants jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_calibration_league_effective
  ON glpm_calibration_config (league_sm_id, effective_from DESC);

COMMENT ON TABLE glpm_calibration_config IS
  'Per-league GLPM calibration (confidenceLayer and future knobs). Latest effective_from wins per league_sm_id.';

ALTER TABLE glpm_market_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_calibration_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'glpm_market_evaluations'
      AND policyname = 'glpm_market_evaluations_select_public'
  ) THEN
    CREATE POLICY glpm_market_evaluations_select_public
      ON glpm_market_evaluations FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'glpm_calibration_config'
      AND policyname = 'glpm_calibration_config_select_public'
  ) THEN
    CREATE POLICY glpm_calibration_config_select_public
      ON glpm_calibration_config FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
