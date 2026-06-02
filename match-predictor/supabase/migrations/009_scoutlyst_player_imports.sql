-- Scoutlyst weekly player stat snapshots (CSV import from data/imports/scoutlyst/)

CREATE TABLE IF NOT EXISTS scoutlyst_import_batches (
  id bigserial PRIMARY KEY,
  file_name text NOT NULL,
  snapshot_date date NOT NULL,
  rows_imported int NOT NULL DEFAULT 0,
  rows_linked int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scoutlyst_import_batches_snapshot
  ON scoutlyst_import_batches (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS scoutlyst_player_snapshots (
  scoutlyst_player_key text NOT NULL,
  snapshot_date date NOT NULL,
  player_name text NOT NULL,
  team_name text,
  league_name text,
  reference_league_id int,
  reference_team_id int,
  sofascore_player_id int,
  position text,
  age int,
  rating numeric(6, 3),
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_batch_id bigint REFERENCES scoutlyst_import_batches (id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scoutlyst_player_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_scoutlyst_player_snapshots_team
  ON scoutlyst_player_snapshots (reference_team_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_scoutlyst_player_snapshots_sofascore
  ON scoutlyst_player_snapshots (sofascore_player_id, snapshot_date DESC)
  WHERE sofascore_player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS scoutlyst_player_links (
  scoutlyst_player_key text PRIMARY KEY,
  player_name text NOT NULL,
  reference_team_id int,
  sofascore_player_id int,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  linked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scoutlyst_player_links_sofascore
  ON scoutlyst_player_links (sofascore_player_id);

ALTER TABLE scoutlyst_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoutlyst_player_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoutlyst_player_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scoutlyst_import_batches' AND policyname = 'scoutlyst_import_batches_select'
  ) THEN
    CREATE POLICY "scoutlyst_import_batches_select" ON scoutlyst_import_batches
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scoutlyst_player_snapshots' AND policyname = 'scoutlyst_player_snapshots_select'
  ) THEN
    CREATE POLICY "scoutlyst_player_snapshots_select" ON scoutlyst_player_snapshots
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scoutlyst_player_links' AND policyname = 'scoutlyst_player_links_select'
  ) THEN
    CREATE POLICY "scoutlyst_player_links_select" ON scoutlyst_player_links
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
