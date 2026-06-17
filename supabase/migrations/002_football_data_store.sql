-- Structured football/weather store (populated by /api/cron/sync, read by the app)

CREATE TABLE IF NOT EXISTS data_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  football_api_calls int NOT NULL DEFAULT 0,
  weather_api_calls int NOT NULL DEFAULT 0,
  leagues_synced int NOT NULL DEFAULT 0,
  fixtures_synced int NOT NULL DEFAULT 0,
  bundles_synced int NOT NULL DEFAULT 0,
  error_message text,
  details jsonb
);

CREATE TABLE IF NOT EXISTS data_sync_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_success_at timestamptz,
  next_sync_after timestamptz,
  last_run_id uuid REFERENCES data_sync_runs (id)
);

INSERT INTO data_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS synced_teams (
  league_id int NOT NULL,
  team_id int NOT NULL,
  team_name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_teams_league ON synced_teams (league_id);

CREATE TABLE IF NOT EXISTS synced_fixtures (
  event_id int PRIMARY KEY,
  league_id int NOT NULL,
  league_name text NOT NULL,
  season int NOT NULL,
  kickoff_at timestamptz NOT NULL,
  venue_city text NOT NULL,
  home_team_id int NOT NULL,
  home_team_name text NOT NULL,
  away_team_id int NOT NULL,
  away_team_name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synced_fixtures_league_kickoff ON synced_fixtures (league_id, kickoff_at);

CREATE TABLE IF NOT EXISTS synced_match_bundles (
  match_id int PRIMARY KEY,
  league_id int NOT NULL,
  home_team_id int NOT NULL,
  away_team_id int NOT NULL,
  bundle jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synced_weather (
  city_key text NOT NULL,
  forecast_date date NOT NULL,
  forecast jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city_key, forecast_date)
);

ALTER TABLE data_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_match_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_weather ENABLE ROW LEVEL SECURITY;

-- Public read for fixture/team pickers (no write policies = service role only for writes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'synced_fixtures' AND policyname = 'synced_fixtures_select'
  ) THEN
    CREATE POLICY "synced_fixtures_select" ON synced_fixtures
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'synced_teams' AND policyname = 'synced_teams_select'
  ) THEN
    CREATE POLICY "synced_teams_select" ON synced_teams
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
