-- Persist Odds API book prices for CLV / sharp-shrink (GLPM club leagues).

CREATE TABLE IF NOT EXISTS glpm_odds_snapshots (
  id bigserial PRIMARY KEY,
  match_sm_id integer,
  league_sm_id integer NOT null,
  sport_key text NOT null,
  odds_event_id text,
  home_team text,
  away_team text,
  commence_time timestamptz,
  captured_at timestamptz NOT null DEFAULT now(),
  book text NOT null,
  market_key text NOT null,
  selection text NOT null,
  line double precision,
  decimal_odds double precision NOT null,
  implied_prob double precision,
  fair_prob double precision,
  source text NOT null DEFAULT 'odds_api',
  UNIQUE (sport_key, odds_event_id, book, market_key, selection, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_glpm_odds_snapshots_match
  ON glpm_odds_snapshots (match_sm_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_odds_snapshots_league_captured
  ON glpm_odds_snapshots (league_sm_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_odds_snapshots_event
  ON glpm_odds_snapshots (odds_event_id, captured_at DESC);

COMMENT ON TABLE glpm_odds_snapshots IS
  'Archived Pinnacle/Unibet (Odds API) prices for GLPM CLV and sharp-shrink calibration.';

ALTER TABLE glpm_odds_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'glpm_odds_snapshots'
      AND policyname = 'glpm_odds_snapshots_select_public'
  ) THEN
    CREATE POLICY glpm_odds_snapshots_select_public
      ON glpm_odds_snapshots FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
