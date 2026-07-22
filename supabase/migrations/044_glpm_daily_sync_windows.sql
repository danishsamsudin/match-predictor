-- Daily SportMonks sync windows (morning / lineup / results / refresh) for GLPM.
-- One row per matchday calendar date in the operator timezone (GLPM_MATCHDAY_TIMEZONE).

CREATE TABLE IF NOT EXISTS glpm_daily_sync_windows (
  match_date date NOT NULL PRIMARY KEY,
  time_zone text NOT NULL,
  fixture_ids bigint[] NOT NULL DEFAULT '{}'::bigint[],
  first_kickoff_at timestamptz,
  last_kickoff_at timestamptz,
  lineup_due_at timestamptz,
  results_due_at timestamptz,
  refresh_due_at timestamptz,
  empty_matchday boolean NOT NULL DEFAULT false,
  lineup_done boolean NOT NULL DEFAULT false,
  results_done boolean NOT NULL DEFAULT false,
  refresh_done boolean NOT NULL DEFAULT false,
  lineup_confirmed_count int NOT NULL DEFAULT 0,
  morning_summary jsonb,
  lineup_summary jsonb,
  results_summary jsonb,
  refresh_summary jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_daily_sync_windows_lineup_due
  ON glpm_daily_sync_windows (lineup_due_at)
  WHERE NOT lineup_done AND NOT empty_matchday;

CREATE INDEX IF NOT EXISTS idx_glpm_daily_sync_windows_results_due
  ON glpm_daily_sync_windows (results_due_at)
  WHERE NOT results_done AND NOT empty_matchday;

CREATE INDEX IF NOT EXISTS idx_glpm_daily_sync_windows_refresh_due
  ON glpm_daily_sync_windows (refresh_due_at)
  WHERE NOT refresh_done AND results_done AND NOT empty_matchday;

COMMENT ON TABLE glpm_daily_sync_windows IS
  'Per-matchday SportMonks sync schedule and done flags for GitHub Actions dispatcher.';

COMMENT ON COLUMN glpm_daily_sync_windows.time_zone IS
  'IANA timezone used to define match_date (set via GLPM_MATCHDAY_TIMEZONE).';

COMMENT ON COLUMN glpm_daily_sync_windows.lineup_due_at IS
  'first_kickoff_at minus ~70 minutes (official lineup window).';

COMMENT ON COLUMN glpm_daily_sync_windows.results_due_at IS
  'last_kickoff_at plus ~110m match length plus 2h.';

COMMENT ON COLUMN glpm_daily_sync_windows.refresh_due_at IS
  'results_due_at plus ~60m - retrain engines and force upcoming predictions.';

ALTER TABLE glpm_daily_sync_windows ENABLE ROW LEVEL SECURITY;
