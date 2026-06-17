CREATE TABLE IF NOT EXISTS transfermarkt_team_squad_snapshots (
  team_id int NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  team_name text,
  transfermarkt_team_id int,
  total_market_value_eur numeric(14, 2),
  squad_size int,
  average_age numeric(4, 1),
  foreigners_count int,
  foreigners_pct numeric(5, 2),
  confederation text,
  fifa_ranking int,
  payload jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_transfermarkt_team_squad_team
  ON transfermarkt_team_squad_snapshots (team_id, snapshot_date DESC);

ALTER TABLE transfermarkt_team_squad_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transfermarkt_team_squad_snapshots'
      AND policyname = 'transfermarkt_team_squad_snapshots_select'
  ) THEN
    CREATE POLICY "transfermarkt_team_squad_snapshots_select" ON transfermarkt_team_squad_snapshots
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
