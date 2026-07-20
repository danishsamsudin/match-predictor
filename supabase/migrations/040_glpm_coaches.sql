-- GLPM coaches dimension (SportMonks primary)

CREATE TABLE IF NOT EXISTS glpm_coaches (
  sm_id bigint PRIMARY KEY,
  name text NOT NULL,
  first_name text,
  last_name text,
  nationality text,
  birth_date date,
  current_team_sm_id bigint REFERENCES glpm_teams (sm_id),
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_coaches_team ON glpm_coaches (current_team_sm_id);

ALTER TABLE glpm_coaches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'glpm_coaches' AND policyname = 'glpm_coaches_read'
  ) THEN
    CREATE POLICY glpm_coaches_read ON glpm_coaches FOR SELECT USING (true);
  END IF;
END $$;
