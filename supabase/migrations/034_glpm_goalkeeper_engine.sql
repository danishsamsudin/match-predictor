-- GLPM Goalkeeper Engine (Chapter 5)
-- Expands player match stats for GK raw inputs + player-level rating tables.

-- ---------------------------------------------------------------------------
-- Widen glpm_match_player_stats for Chapter 5 GK observations
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_match_player_stats
  ADD COLUMN IF NOT EXISTS is_goalkeeper boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goals_conceded int,
  ADD COLUMN IF NOT EXISTS shots_faced int,
  ADD COLUMN IF NOT EXISTS sot_faced int,
  ADD COLUMN IF NOT EXISTS crosses_faced int,
  ADD COLUMN IF NOT EXISTS claims_attempted int,
  ADD COLUMN IF NOT EXISTS claims_successful int,
  ADD COLUMN IF NOT EXISTS punches int,
  ADD COLUMN IF NOT EXISTS aerial_duels_won int,
  ADD COLUMN IF NOT EXISTS passes int,
  ADD COLUMN IF NOT EXISTS passes_completed int,
  ADD COLUMN IF NOT EXISTS long_passes int,
  ADD COLUMN IF NOT EXISTS long_passes_completed int,
  ADD COLUMN IF NOT EXISTS progressive_passes int,
  ADD COLUMN IF NOT EXISTS progressive_pass_distance numeric(10, 2),
  ADD COLUMN IF NOT EXISTS passes_under_pressure int,
  ADD COLUMN IF NOT EXISTS passes_under_pressure_completed int,
  ADD COLUMN IF NOT EXISTS def_actions_outside_box int,
  ADD COLUMN IF NOT EXISTS sweeper_clearances int,
  ADD COLUMN IF NOT EXISTS through_ball_interceptions int,
  ADD COLUMN IF NOT EXISTS recoveries_outside_box int,
  ADD COLUMN IF NOT EXISTS avg_defensive_action_x numeric(8, 3),
  ADD COLUMN IF NOT EXISTS penalties_faced int,
  ADD COLUMN IF NOT EXISTS penalties_saved int,
  ADD COLUMN IF NOT EXISTS penalty_psxg_faced numeric(8, 4);

CREATE INDEX IF NOT EXISTS idx_glpm_match_player_stats_gk
  ON glpm_match_player_stats (match_sm_id, team_sm_id)
  WHERE is_goalkeeper = true;

-- Team-level goals prevented (SportMonks type 9686 / derived)
ALTER TABLE glpm_match_team_stats
  ADD COLUMN IF NOT EXISTS goals_prevented numeric(8, 4);

-- ---------------------------------------------------------------------------
-- Player primary ratings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_player_primary_ratings (
  player_sm_id bigint NOT NULL REFERENCES glpm_players (sm_id) ON DELETE CASCADE,
  team_sm_id bigint REFERENCES glpm_teams (sm_id),
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  rating_type text NOT NULL
    CHECK (rating_type IN ('goalkeeper')),
  as_of_date date NOT NULL,
  rating numeric(6, 2) NOT NULL
    CHECK (rating >= 0 AND rating <= 100),
  confidence numeric(8, 5) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  variance numeric(12, 6) NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'gk_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_sm_id, season_id, rating_type, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_glpm_player_primary_ratings_type
  ON glpm_player_primary_ratings (rating_type, as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_glpm_player_primary_ratings_player
  ON glpm_player_primary_ratings (player_sm_id, rating_type, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- Player domain ratings (Goal Prevention / Goalkeeper Involvement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_player_domain_ratings (
  player_sm_id bigint NOT NULL REFERENCES glpm_players (sm_id) ON DELETE CASCADE,
  team_sm_id bigint REFERENCES glpm_teams (sm_id),
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  domain text NOT NULL
    CHECK (domain IN ('goal_prevention', 'goalkeeper_involvement')),
  as_of_date date NOT NULL,
  rating numeric(6, 2) NOT NULL
    CHECK (rating >= 0 AND rating <= 100),
  confidence numeric(8, 5) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  variance numeric(12, 6) NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'gk_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_sm_id, season_id, domain, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_glpm_player_domain_ratings_domain
  ON glpm_player_domain_ratings (domain, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- Player component ratings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_player_component_ratings (
  player_sm_id bigint NOT NULL REFERENCES glpm_players (sm_id) ON DELETE CASCADE,
  team_sm_id bigint REFERENCES glpm_teams (sm_id),
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  component text NOT NULL
    CHECK (component IN (
      'shot_stopping', 'area_command', 'distribution', 'sweeper', 'penalty'
    )),
  as_of_date date NOT NULL,
  rating numeric(6, 2) NOT NULL
    CHECK (rating >= 0 AND rating <= 100),
  confidence numeric(8, 5) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  variance numeric(12, 6) NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'gk_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_sm_id, season_id, component, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_glpm_player_component_ratings_comp
  ON glpm_player_component_ratings (component, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- Player rating history (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS glpm_player_rating_history (
  id bigserial PRIMARY KEY,
  player_sm_id bigint NOT NULL REFERENCES glpm_players (sm_id) ON DELETE CASCADE,
  team_sm_id bigint REFERENCES glpm_teams (sm_id),
  season_id bigint REFERENCES glpm_seasons (sm_id),
  as_of_date date NOT NULL,
  layer text NOT NULL CHECK (layer IN ('primary', 'domain', 'component')),
  name text NOT NULL,
  rating numeric(6, 2) NOT NULL,
  confidence numeric(8, 5),
  variance numeric(12, 6),
  model_version text NOT NULL DEFAULT 'gk_v1',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glpm_player_rating_history_player
  ON glpm_player_rating_history (player_sm_id, layer, name, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_player_primary_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_player_domain_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_player_component_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_player_rating_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'glpm_player_primary_ratings',
    'glpm_player_domain_ratings',
    'glpm_player_component_ratings',
    'glpm_player_rating_history'
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
