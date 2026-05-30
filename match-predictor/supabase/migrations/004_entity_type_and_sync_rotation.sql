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
