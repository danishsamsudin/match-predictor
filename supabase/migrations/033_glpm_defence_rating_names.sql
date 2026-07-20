-- GLPM Defence rating names + ensure rating tables exist.
-- Safe to run whether or not 032_glpm_team_ratings.sql has been applied.
-- Creates the rating tables if missing (with final CHECKs), then expands
-- component/domain CHECKs when tables already exist from 032.

-- ---------------------------------------------------------------------------
-- Ensure tables exist (no-op when 032 already created them)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_team_primary_ratings (
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id) ON DELETE CASCADE,
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  rating_type text NOT NULL
    CHECK (rating_type IN (
      'attack', 'defence', 'goalkeeper', 'finishing',
      'pressing', 'build_up', 'possession'
    )),
  as_of_date date NOT NULL,
  rating numeric(6, 2) NOT NULL
    CHECK (rating >= 0 AND rating <= 100),
  confidence numeric(8, 5) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  variance numeric(12, 6) NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'attack_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_sm_id, season_id, rating_type, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_glpm_primary_ratings_type
  ON glpm_team_primary_ratings (rating_type, as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_primary_ratings_team
  ON glpm_team_primary_ratings (team_sm_id, rating_type, as_of_date DESC);

CREATE TABLE IF NOT EXISTS glpm_team_component_ratings (
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id) ON DELETE CASCADE,
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  component text NOT NULL
    CHECK (component IN (
      'chance_volume', 'chance_quality', 'ball_progression',
      'territorial_control', 'transition_threat', 'set_piece_threat',
      'chance_suppression', 'defensive_organisation', 'transition_defence',
      'box_protection', 'set_piece_defence', 'press_resistance',
      'pressing', 'defensive_territorial_control'
    )),
  as_of_date date NOT NULL,
  rating numeric(6, 2) NOT NULL
    CHECK (rating >= 0 AND rating <= 100),
  confidence numeric(8, 5) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  variance numeric(12, 6) NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'attack_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_sm_id, season_id, component, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_glpm_component_ratings_comp
  ON glpm_team_component_ratings (component, as_of_date DESC);

CREATE TABLE IF NOT EXISTS glpm_team_domain_ratings (
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id) ON DELETE CASCADE,
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  domain text NOT NULL
    CHECK (domain IN (
      'creation', 'progression', 'situational',
      'suppression', 'organisation', 'special_teams',
      'prevention', 'protection', 'control'
    )),
  as_of_date date NOT NULL,
  rating numeric(6, 2) NOT NULL
    CHECK (rating >= 0 AND rating <= 100),
  confidence numeric(8, 5) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  variance numeric(12, 6) NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'attack_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_sm_id, season_id, domain, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_glpm_domain_ratings_domain
  ON glpm_team_domain_ratings (domain, as_of_date DESC);

CREATE TABLE IF NOT EXISTS glpm_rating_history (
  id bigserial PRIMARY KEY,
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id) ON DELETE CASCADE,
  season_id bigint REFERENCES glpm_seasons (sm_id),
  as_of_date date NOT NULL,
  layer text NOT NULL CHECK (layer IN ('primary', 'domain', 'component')),
  name text NOT NULL,
  rating numeric(6, 2) NOT NULL,
  confidence numeric(8, 5),
  variance numeric(12, 6),
  model_version text NOT NULL DEFAULT 'attack_v1',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_rating_history_team
  ON glpm_rating_history (team_sm_id, layer, name, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- Expand CHECKs when tables were created by 032 with narrower lists
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_team_component_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_component_ratings_component_check;

ALTER TABLE glpm_team_component_ratings
  ADD CONSTRAINT glpm_team_component_ratings_component_check
  CHECK (component IN (
    'chance_volume', 'chance_quality', 'ball_progression',
    'territorial_control', 'transition_threat', 'set_piece_threat',
    'chance_suppression', 'defensive_organisation', 'transition_defence',
    'box_protection', 'set_piece_defence', 'press_resistance',
    'pressing', 'defensive_territorial_control'
  ));

ALTER TABLE glpm_team_domain_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_domain_ratings_domain_check;

ALTER TABLE glpm_team_domain_ratings
  ADD CONSTRAINT glpm_team_domain_ratings_domain_check
  CHECK (domain IN (
    'creation', 'progression', 'situational',
    'suppression', 'organisation', 'special_teams',
    'prevention', 'protection', 'control'
  ));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_team_primary_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_team_component_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_team_domain_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_rating_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'glpm_team_primary_ratings',
    'glpm_team_component_ratings',
    'glpm_team_domain_ratings',
    'glpm_rating_history'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)',
        t || '_select',
        t
      );
    END IF;
  END LOOP;
END $$;
