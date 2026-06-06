-- Graham model: match-level process metrics + national team ratings + talent snapshots

CREATE TABLE IF NOT EXISTS national_match_process_metrics (
  event_id int PRIMARY KEY,
  source text NOT NULL,
  match_date date,
  home_team_id int,
  away_team_id int,
  home_xg numeric(6, 3),
  away_xg numeric(6, 3),
  home_shots int,
  away_shots int,
  home_sot int,
  away_sot int,
  competition_tier numeric(4, 2),
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_national_match_process_metrics_date
  ON national_match_process_metrics (match_date DESC);

CREATE INDEX IF NOT EXISTS idx_national_match_process_metrics_teams
  ON national_match_process_metrics (home_team_id, away_team_id);

CREATE TABLE IF NOT EXISTS national_team_ratings (
  team_id int NOT NULL,
  rating_type text NOT NULL,
  rating numeric(8, 3) NOT NULL,
  sample_weight numeric(8, 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, rating_type)
);

CREATE INDEX IF NOT EXISTS idx_national_team_ratings_type
  ON national_team_ratings (rating_type, rating DESC);

CREATE TABLE IF NOT EXISTS transfermarkt_squad_snapshots (
  team_id int NOT NULL,
  player_name text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  market_value_eur numeric(14, 2),
  position text,
  club text,
  payload jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, player_name, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_transfermarkt_squad_team
  ON transfermarkt_squad_snapshots (team_id, snapshot_date DESC);

ALTER TABLE scoutlyst_player_snapshots
  ADD COLUMN IF NOT EXISTS market_value_eur numeric(14, 2),
  ADD COLUMN IF NOT EXISTS salary_eur numeric(14, 2);

ALTER TABLE national_match_process_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE national_team_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfermarkt_squad_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'national_match_process_metrics'
      AND policyname = 'national_match_process_metrics_select'
  ) THEN
    CREATE POLICY "national_match_process_metrics_select" ON national_match_process_metrics
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'national_team_ratings'
      AND policyname = 'national_team_ratings_select'
  ) THEN
    CREATE POLICY "national_team_ratings_select" ON national_team_ratings
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transfermarkt_squad_snapshots'
      AND policyname = 'transfermarkt_squad_snapshots_select'
  ) THEN
    CREATE POLICY "transfermarkt_squad_snapshots_select" ON transfermarkt_squad_snapshots
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
