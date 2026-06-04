-- Manual / cron-scraped injury & suspension flags for lineup prediction overrides

CREATE TABLE IF NOT EXISTS player_availabilities (
  player_name text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('injured', 'suspended', 'doubtful')),
  source text,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_player_availabilities_status
  ON player_availabilities (status, updated_at DESC);

ALTER TABLE player_availabilities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_availabilities'
      AND policyname = 'player_availabilities_select'
  ) THEN
    CREATE POLICY "player_availabilities_select" ON player_availabilities
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
