-- Persisted GLPM reliability baselines for ops + public marketing metrics.
-- Night refresh / dedicated cron upserts the singleton "latest" row.

BEGIN;

CREATE TABLE IF NOT EXISTS glpm_reliability_baseline_snapshots (
  id text PRIMARY KEY,
  computed_at timestamptz NOT NULL DEFAULT now(),
  n_rows integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  marketing_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE glpm_reliability_baseline_snapshots IS
  'GLPM reliability baseline snapshots. Use id = latest for the active marketing/ops report.';

COMMENT ON COLUMN glpm_reliability_baseline_snapshots.payload IS
  'Full ReliabilityBaselineReport JSON (leagues, markets, overall).';

COMMENT ON COLUMN glpm_reliability_baseline_snapshots.marketing_payload IS
  'Public-safe LeaguePerformanceSummary JSON for marketing pages.';

CREATE INDEX IF NOT EXISTS glpm_reliability_baseline_snapshots_computed_at_idx
  ON glpm_reliability_baseline_snapshots (computed_at DESC);

ALTER TABLE glpm_reliability_baseline_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS glpm_reliability_baseline_snapshots_select_public
  ON glpm_reliability_baseline_snapshots;

CREATE POLICY glpm_reliability_baseline_snapshots_select_public
  ON glpm_reliability_baseline_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
