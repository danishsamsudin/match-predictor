-- NL player prop evaluations for post-match calibrate/train

BEGIN;

CREATE TABLE IF NOT EXISTS nations_league_player_prop_evaluations (
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

CREATE INDEX IF NOT EXISTS idx_nl_player_prop_eval_match
  ON nations_league_player_prop_evaluations (match_id);

CREATE INDEX IF NOT EXISTS idx_nl_player_prop_eval_market
  ON nations_league_player_prop_evaluations (market, computed_at DESC);

ALTER TABLE nations_league_player_prop_evaluations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_player_prop_evaluations'
      AND policyname = 'nations_league_player_prop_evaluations_select_public'
  ) THEN
    CREATE POLICY nations_league_player_prop_evaluations_select_public
      ON nations_league_player_prop_evaluations FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
