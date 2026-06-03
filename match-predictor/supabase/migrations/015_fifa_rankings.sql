-- FIFA men's world ranking history (Kaggle: lucasyukioimafuko/fifa-mens-world-ranking)

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
  CONSTRAINT fifa_ranking_snapshots_unique_team UNIQUE (ranking_year, semester, normalized_team_name)
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
