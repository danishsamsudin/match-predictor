-- Full football data catalog (SofaScore primary / SportAPI7 fallback) + daily API budget

CREATE TABLE IF NOT EXISTS football_api_daily (
  usage_date date PRIMARY KEY DEFAULT CURRENT_DATE,
  call_count int NOT NULL DEFAULT 0,
  last_provider text,
  last_endpoint text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS football_api_call_log (
  id bigserial PRIMARY KEY,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  provider text NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_football_api_call_log_date ON football_api_call_log (usage_date DESC);

-- Raw payloads for audit / future features (one row per entity)
CREATE TABLE IF NOT EXISTS synced_api_payloads (
  provider text NOT NULL,
  endpoint text NOT NULL,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, entity_type, entity_key)
);

CREATE TABLE IF NOT EXISTS synced_seasons (
  unique_tournament_id int NOT NULL,
  season_id int NOT NULL,
  season_name text,
  season_year text,
  reference_league_id int,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unique_tournament_id, season_id)
);

CREATE TABLE IF NOT EXISTS synced_tournaments (
  unique_tournament_id int PRIMARY KEY,
  reference_league_id int,
  name text NOT NULL,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synced_standings (
  unique_tournament_id int NOT NULL,
  season_id int NOT NULL,
  reference_league_id int NOT NULL,
  standing_type text NOT NULL DEFAULT 'total',
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unique_tournament_id, season_id, standing_type)
);

CREATE TABLE IF NOT EXISTS synced_events (
  event_id int PRIMARY KEY,
  unique_tournament_id int NOT NULL,
  season_id int,
  reference_league_id int NOT NULL,
  kickoff_at timestamptz,
  status_type text,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synced_events_league ON synced_events (reference_league_id, kickoff_at);

CREATE TABLE IF NOT EXISTS synced_event_statistics (
  event_id int PRIMARY KEY,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synced_event_lineups (
  event_id int PRIMARY KEY,
  payload jsonb NOT NULL,
  confirmed boolean,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synced_event_incidents (
  event_id int PRIMARY KEY,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synced_event_h2h (
  event_id int PRIMARY KEY,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synced_team_statistics (
  team_id int NOT NULL,
  unique_tournament_id int NOT NULL,
  season_id int NOT NULL,
  reference_league_id int NOT NULL,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, unique_tournament_id, season_id)
);

ALTER TABLE data_sync_runs ADD COLUMN IF NOT EXISTS primary_provider text;
ALTER TABLE data_sync_runs ADD COLUMN IF NOT EXISTS secondary_fallback_calls int NOT NULL DEFAULT 0;

ALTER TABLE data_sync_state ADD COLUMN IF NOT EXISTS last_sync_date date;
ALTER TABLE data_sync_state ADD COLUMN IF NOT EXISTS sync_hour_utc int;

ALTER TABLE football_api_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE football_api_call_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_api_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_event_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_event_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_event_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_event_h2h ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_team_statistics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'synced_events' AND policyname = 'synced_events_select'
  ) THEN
    CREATE POLICY "synced_events_select" ON synced_events
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
