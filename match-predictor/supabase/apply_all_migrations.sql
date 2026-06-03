-- Match Predictor: apply all migrations (001 → 004) in one go
-- Safe to re-run: uses IF NOT EXISTS for tables/indexes and guarded policies.

-- ========== 001_prediction_engine.sql ==========
-- API response cache with TTL
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('football', 'weather')),
  response jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON api_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_api_cache_provider ON api_cache (provider);

-- Daily API usage counters for rate limiting
CREATE TABLE IF NOT EXISTS api_usage_daily (
  provider text NOT NULL CHECK (provider IN ('football', 'weather')),
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  call_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, usage_date)
);

-- Persisted prediction results
CREATE TABLE IF NOT EXISTS predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id int NOT NULL,
  home_team_id int NOT NULL,
  away_team_id int NOT NULL,
  city text NOT NULL,
  match_date timestamptz NOT NULL,
  home_win_pct numeric(5, 2) NOT NULL,
  away_win_pct numeric(5, 2) NOT NULL,
  draw_pct numeric(5, 2) NOT NULL,
  home_xg numeric(4, 2) NOT NULL,
  away_xg numeric(4, 2) NOT NULL,
  estimated_corners numeric(5, 1) NOT NULL,
  estimated_fouls numeric(5, 1) NOT NULL,
  estimated_yellow_cards numeric(4, 1) NOT NULL,
  estimated_red_cards numeric(3, 1) NOT NULL,
  explanation text NOT NULL,
  inputs_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions (match_id);

-- Row Level Security
ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Predictions: public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'predictions' AND policyname = 'predictions_select_anon'
  ) THEN
    CREATE POLICY "predictions_select_anon" ON predictions
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Cache and usage tables: no public policies (service role only)

-- ========== 002_football_data_store.sql ==========
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

-- ========== 003_sofascore_data_catalog.sql ==========
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

-- ========== 004_entity_type_and_sync_rotation.sql ==========
-- Entity types for clubs vs national teams, comparison metadata, sync rotation state
--
-- PREREQUISITE: Run these first (in order):
--   001_prediction_engine.sql
--   002_football_data_store.sql
--   003_sofascore_data_catalog.sql
--
-- Or run the combined file: supabase/apply_all_migrations.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'synced_teams'
  ) THEN
    RAISE EXCEPTION 'Missing table synced_teams. Run 002_football_data_store.sql first (or apply_all_migrations.sql).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'predictions'
  ) THEN
    RAISE EXCEPTION 'Missing table predictions. Run 001_prediction_engine.sql first (or apply_all_migrations.sql).';
  END IF;
END $$;

ALTER TABLE synced_teams ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'club';

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS entity_type text DEFAULT 'club';
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS home_league_id int;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS away_league_id int;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS comparison_mode text DEFAULT 'fixture';

CREATE TABLE IF NOT EXISTS sync_league_state (
  reference_league_id int PRIMARY KEY,
  last_teams_sync_at timestamptz,
  last_fixtures_sync_at timestamptz,
  next_sync_after timestamptz
);

CREATE INDEX IF NOT EXISTS idx_synced_teams_entity ON synced_teams (entity_type, league_id);

ALTER TABLE sync_league_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sync_league_state' AND policyname = 'sync_league_state_select'
  ) THEN
    CREATE POLICY "sync_league_state_select" ON sync_league_state
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ========== 005_player_ratings.sql ==========
CREATE TABLE IF NOT EXISTS synced_player_ratings (
  player_id int PRIMARY KEY,
  club_avg_rating numeric(4, 2),
  sample_size int NOT NULL DEFAULT 0,
  ratings jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synced_player_ratings_synced_at ON synced_player_ratings (synced_at DESC);

ALTER TABLE synced_player_ratings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'synced_player_ratings' AND policyname = 'synced_player_ratings_select'
  ) THEN
    CREATE POLICY "synced_player_ratings_select" ON synced_player_ratings
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ========== 006_soccerdata_mapping.sql ==========
-- SoccerData ↔ SofaScore mapping + enrichments (canonical ids remain SofaScore/SportAPI)

CREATE TABLE IF NOT EXISTS soccerdata_team_aliases (
  league_id int NOT NULL,
  team_id int NOT NULL,
  source text NOT NULL,
  soccerdata_team_name text NOT NULL,
  normalized_team_name text NOT NULL,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, team_id, source)
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_team_aliases_lookup
  ON soccerdata_team_aliases (source, league_id, normalized_team_name);

CREATE TABLE IF NOT EXISTS soccerdata_match_links (
  event_id int NOT NULL,
  league_id int NOT NULL,
  source text NOT NULL,
  soccerdata_match_key text NOT NULL,
  kickoff_at timestamptz,
  home_team_id int,
  away_team_id int,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  linked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, source)
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_match_links_key
  ON soccerdata_match_links (source, soccerdata_match_key);

CREATE TABLE IF NOT EXISTS soccerdata_players (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  league_id int,
  team_id int,
  position text,
  country text,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_players_team ON soccerdata_players (team_id);

CREATE TABLE IF NOT EXISTS soccerdata_player_links (
  player_id bigint NOT NULL REFERENCES soccerdata_players (id) ON DELETE CASCADE,
  source text NOT NULL,
  soccerdata_player_key text NOT NULL,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, source)
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_player_links_key
  ON soccerdata_player_links (source, soccerdata_player_key);

CREATE TABLE IF NOT EXISTS soccerdata_event_enrichments (
  event_id int PRIMARY KEY,
  league_id int,
  season int,
  xg_home numeric(6, 3),
  xg_away numeric(6, 3),
  odds_home numeric(10, 4),
  odds_draw numeric(10, 4),
  odds_away numeric(10, 4),
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_event_enrichments_league
  ON soccerdata_event_enrichments (league_id, season);

ALTER TABLE soccerdata_team_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_match_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_player_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_event_enrichments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_team_aliases' AND policyname = 'soccerdata_team_aliases_select'
  ) THEN
    CREATE POLICY "soccerdata_team_aliases_select" ON soccerdata_team_aliases
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_match_links' AND policyname = 'soccerdata_match_links_select'
  ) THEN
    CREATE POLICY "soccerdata_match_links_select" ON soccerdata_match_links
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_players' AND policyname = 'soccerdata_players_select'
  ) THEN
    CREATE POLICY "soccerdata_players_select" ON soccerdata_players
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_player_links' AND policyname = 'soccerdata_player_links_select'
  ) THEN
    CREATE POLICY "soccerdata_player_links_select" ON soccerdata_player_links
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_event_enrichments' AND policyname = 'soccerdata_event_enrichments_select'
  ) THEN
    CREATE POLICY "soccerdata_event_enrichments_select" ON soccerdata_event_enrichments
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ========== 007_soccerdata_player_fields.sql ==========
ALTER TABLE soccerdata_players
  ADD COLUMN IF NOT EXISTS sofifa_overall numeric(5, 2);

CREATE INDEX IF NOT EXISTS idx_soccerdata_players_sofifa
  ON soccerdata_players (team_id, sofifa_overall DESC);

-- ========== 008_security_rls_policies.sql ==========
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated;

DO $$
DECLARE
  tbl text;
  pol_name text;
  tables text[] := ARRAY[
    'api_cache',
    'api_usage_daily',
    'data_sync_runs',
    'data_sync_state',
    'football_api_call_log',
    'football_api_daily',
    'predictions_log',
    'stadium_profiles',
    'synced_api_payloads',
    'synced_event_h2h',
    'synced_event_incidents',
    'synced_event_lineups',
    'synced_event_statistics',
    'synced_match_bundles',
    'synced_seasons',
    'synced_standings',
    'synced_team_statistics',
    'synced_tournaments',
    'synced_weather'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    pol_name := tbl || '_no_public_access';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        pol_name,
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- 015_fifa_rankings.sql
CREATE TABLE IF NOT EXISTS fifa_ranking_snapshots (
  id bigserial PRIMARY KEY,
  ranking_year int NOT NULL,
  semester int NOT NULL CHECK (semester IN (1, 2)),
  rank int NOT NULL CHECK (rank > 0),
  team_name text NOT NULL,
  acronym text,
  total_points numeric(10, 2) NOT NULL,
  previous_points numeric(10, 2),
  points_diff numeric(10, 2),
  normalized_team_name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fifa_ranking_snapshots_unique_team UNIQUE (ranking_year, semester, normalized_team_name),
  CONSTRAINT fifa_ranking_snapshots_unique_rank UNIQUE (ranking_year, semester, rank)
);

CREATE INDEX IF NOT EXISTS idx_fifa_ranking_snapshots_lookup
  ON fifa_ranking_snapshots (normalized_team_name, ranking_year DESC, semester DESC);

CREATE INDEX IF NOT EXISTS idx_fifa_ranking_snapshots_snapshot
  ON fifa_ranking_snapshots (ranking_year DESC, semester DESC, rank);

ALTER TABLE fifa_ranking_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fifa_ranking_snapshots'
      AND policyname = 'fifa_ranking_snapshots_select'
  ) THEN
    CREATE POLICY "fifa_ranking_snapshots_select" ON fifa_ranking_snapshots
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- 016_fifa_rankings_sofascore.sql
ALTER TABLE fifa_ranking_snapshots
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS sofascore_team_id int;

CREATE INDEX IF NOT EXISTS idx_fifa_ranking_sofascore_team
  ON fifa_ranking_snapshots (sofascore_team_id)
  WHERE sofascore_team_id IS NOT NULL;

-- 017_fifa_rankings_allow_tied_ranks.sql
ALTER TABLE fifa_ranking_snapshots
  DROP CONSTRAINT IF EXISTS fifa_ranking_snapshots_unique_rank;
-- 015_fifa_rankings.sql
CREATE TABLE IF NOT EXISTS fifa_ranking_snapshots (
  id bigserial PRIMARY KEY,
  ranking_year int NOT NULL,
  semester int NOT NULL CHECK (semester IN (1, 2)),
  rank int NOT NULL CHECK (rank > 0),
  team_name text NOT NULL,
  acronym text,
  total_points numeric(10, 2) NOT NULL,
  previous_points numeric(10, 2),
  points_diff numeric(10, 2),
  normalized_team_name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fifa_ranking_snapshots_unique_team UNIQUE (ranking_year, semester, normalized_team_name),
  CONSTRAINT fifa_ranking_snapshots_unique_rank UNIQUE (ranking_year, semester, rank)
);

CREATE INDEX IF NOT EXISTS idx_fifa_ranking_snapshots_lookup
  ON fifa_ranking_snapshots (normalized_team_name, ranking_year DESC, semester DESC);

CREATE INDEX IF NOT EXISTS idx_fifa_ranking_snapshots_snapshot
  ON fifa_ranking_snapshots (ranking_year DESC, semester DESC, rank);

ALTER TABLE fifa_ranking_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fifa_ranking_snapshots'
      AND policyname = 'fifa_ranking_snapshots_select'
  ) THEN
    CREATE POLICY "fifa_ranking_snapshots_select" ON fifa_ranking_snapshots
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- 016_fifa_rankings_sofascore.sql
ALTER TABLE fifa_ranking_snapshots
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS sofascore_team_id int;

CREATE INDEX IF NOT EXISTS idx_fifa_ranking_sofascore_team
  ON fifa_ranking_snapshots (sofascore_team_id)
  WHERE sofascore_team_id IS NOT NULL;

-- 017_fifa_rankings_allow_tied_ranks.sql
ALTER TABLE fifa_ranking_snapshots
  DROP CONSTRAINT IF EXISTS fifa_ranking_snapshots_unique_rank;
