-- Player form ratings (SofaScore best-players, rolling club averages)

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
