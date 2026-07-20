-- GLPM Rating Vector + Level 4 metadata (Chapter 2.9 / Chapter 10.14)
-- Extends primary rating tables and adds the wide Rating Vector product table.

-- ---------------------------------------------------------------------------
-- Level 4 metadata on team primary ratings
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_team_primary_ratings
  ADD COLUMN IF NOT EXISTS matches_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recent_trend text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS trend_delta numeric(8, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historical_peak numeric(6, 2),
  ADD COLUMN IF NOT EXISTS historical_low numeric(6, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'glpm_team_primary_ratings_recent_trend_check'
  ) THEN
    ALTER TABLE glpm_team_primary_ratings
      ADD CONSTRAINT glpm_team_primary_ratings_recent_trend_check
      CHECK (recent_trend IN ('up', 'down', 'flat'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Level 4 metadata on player primary ratings (GK)
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_player_primary_ratings
  ADD COLUMN IF NOT EXISTS matches_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recent_trend text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS trend_delta numeric(8, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historical_peak numeric(6, 2),
  ADD COLUMN IF NOT EXISTS historical_low numeric(6, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'glpm_player_primary_ratings_recent_trend_check'
  ) THEN
    ALTER TABLE glpm_player_primary_ratings
      ADD CONSTRAINT glpm_player_primary_ratings_recent_trend_check
      CHECK (recent_trend IN ('up', 'down', 'flat'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Wide GLPM Rating Vector product: R = [A, D, GK, BU, PO, PR, FR]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_team_rating_vectors (
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id) ON DELETE CASCADE,
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  as_of_date date NOT NULL,
  r_attack numeric(6, 2)
    CHECK (r_attack IS NULL OR (r_attack >= 0 AND r_attack <= 100)),
  r_defence numeric(6, 2)
    CHECK (r_defence IS NULL OR (r_defence >= 0 AND r_defence <= 100)),
  r_goalkeeper numeric(6, 2)
    CHECK (r_goalkeeper IS NULL OR (r_goalkeeper >= 0 AND r_goalkeeper <= 100)),
  r_build_up numeric(6, 2)
    CHECK (r_build_up IS NULL OR (r_build_up >= 0 AND r_build_up <= 100)),
  r_possession numeric(6, 2)
    CHECK (r_possession IS NULL OR (r_possession >= 0 AND r_possession <= 100)),
  r_pressing numeric(6, 2)
    CHECK (r_pressing IS NULL OR (r_pressing >= 0 AND r_pressing <= 100)),
  r_finishing numeric(6, 2)
    CHECK (r_finishing IS NULL OR (r_finishing >= 0 AND r_finishing <= 100)),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL DEFAULT 'vector_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_sm_id, season_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_glpm_rating_vectors_season_date
  ON glpm_team_rating_vectors (season_id, as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_rating_vectors_team
  ON glpm_team_rating_vectors (team_sm_id, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_team_rating_vectors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'glpm_team_rating_vectors'
      AND policyname = 'glpm_team_rating_vectors_select'
  ) THEN
    CREATE POLICY glpm_team_rating_vectors_select
      ON glpm_team_rating_vectors
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;
