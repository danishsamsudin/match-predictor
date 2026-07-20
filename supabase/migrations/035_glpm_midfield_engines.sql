-- GLPM Midfield engines (Build-Up / Possession / Pressing).
-- Adds rating_type to team component/domain tables so shared names
-- (e.g. progression, ball_progression) do not collide across engines.
-- Expands component/domain CHECKs for Chapters 6–8.

-- ---------------------------------------------------------------------------
-- Component ratings: add rating_type + rebuild PK
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_team_component_ratings
  ADD COLUMN IF NOT EXISTS rating_type text;

-- Backfill from known component names
UPDATE glpm_team_component_ratings
SET rating_type = CASE
  WHEN component IN (
    'chance_volume', 'chance_quality', 'ball_progression',
    'territorial_control', 'transition_threat', 'set_piece_threat'
  ) AND rating_type IS NULL THEN 'attack'
  WHEN component IN (
    'chance_suppression', 'defensive_organisation', 'transition_defence',
    'box_protection', 'set_piece_defence', 'pressing',
    'defensive_territorial_control'
  ) AND rating_type IS NULL THEN 'defence'
  WHEN component = 'press_resistance' AND rating_type IS NULL THEN 'build_up'
  ELSE COALESCE(rating_type, 'attack')
END
WHERE rating_type IS NULL;

ALTER TABLE glpm_team_component_ratings
  ALTER COLUMN rating_type SET DEFAULT 'attack';

ALTER TABLE glpm_team_component_ratings
  ALTER COLUMN rating_type SET NOT NULL;

ALTER TABLE glpm_team_component_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_component_ratings_pkey;

ALTER TABLE glpm_team_component_ratings
  ADD CONSTRAINT glpm_team_component_ratings_pkey
  PRIMARY KEY (team_sm_id, season_id, rating_type, component, as_of_date);

ALTER TABLE glpm_team_component_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_component_ratings_rating_type_check;

ALTER TABLE glpm_team_component_ratings
  ADD CONSTRAINT glpm_team_component_ratings_rating_type_check
  CHECK (rating_type IN (
    'attack', 'defence', 'goalkeeper', 'finishing',
    'pressing', 'build_up', 'possession'
  ));

ALTER TABLE glpm_team_component_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_component_ratings_component_check;

ALTER TABLE glpm_team_component_ratings
  ADD CONSTRAINT glpm_team_component_ratings_component_check
  CHECK (component IN (
    -- Attack
    'chance_volume', 'chance_quality', 'ball_progression',
    'territorial_control', 'transition_threat', 'set_piece_threat',
    -- Defence
    'chance_suppression', 'defensive_organisation', 'transition_defence',
    'box_protection', 'set_piece_defence', 'pressing',
    'defensive_territorial_control',
    -- Build-Up (Ch 6)
    'press_resistance', 'vertical_line_breaking', 'security',
    'distribution_accuracy', 'tempo',
    -- Possession (Ch 7)
    'possession_security', 'ball_circulation', 'territorial_dominance',
    'space_control', 'game_control', 'possession_tempo',
    -- Pressing (Ch 8)
    'high_press', 'mid_block_press', 'counter_press',
    'recovery_efficiency', 'press_success', 'press_resistance_disruption'
  ));

CREATE INDEX IF NOT EXISTS idx_glpm_component_ratings_type
  ON glpm_team_component_ratings (rating_type, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- Domain ratings: add rating_type + rebuild PK
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_team_domain_ratings
  ADD COLUMN IF NOT EXISTS rating_type text;

UPDATE glpm_team_domain_ratings
SET rating_type = CASE
  WHEN domain IN ('creation', 'progression', 'situational')
    AND rating_type IS NULL THEN 'attack'
  WHEN domain IN (
    'suppression', 'organisation', 'special_teams',
    'prevention', 'protection', 'control'
  ) AND rating_type IS NULL THEN 'defence'
  WHEN domain IN ('retention', 'distribution') AND rating_type IS NULL THEN 'build_up'
  WHEN domain IN (
    'ball_retention', 'territorial_control', 'possession_control'
  ) AND rating_type IS NULL THEN 'possession'
  WHEN domain IN (
    'press_intensity', 'ball_recovery', 'press_effectiveness'
  ) AND rating_type IS NULL THEN 'pressing'
  ELSE COALESCE(rating_type, 'attack')
END
WHERE rating_type IS NULL;

ALTER TABLE glpm_team_domain_ratings
  ALTER COLUMN rating_type SET DEFAULT 'attack';

ALTER TABLE glpm_team_domain_ratings
  ALTER COLUMN rating_type SET NOT NULL;

ALTER TABLE glpm_team_domain_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_domain_ratings_pkey;

ALTER TABLE glpm_team_domain_ratings
  ADD CONSTRAINT glpm_team_domain_ratings_pkey
  PRIMARY KEY (team_sm_id, season_id, rating_type, domain, as_of_date);

ALTER TABLE glpm_team_domain_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_domain_ratings_rating_type_check;

ALTER TABLE glpm_team_domain_ratings
  ADD CONSTRAINT glpm_team_domain_ratings_rating_type_check
  CHECK (rating_type IN (
    'attack', 'defence', 'goalkeeper', 'finishing',
    'pressing', 'build_up', 'possession'
  ));

ALTER TABLE glpm_team_domain_ratings
  DROP CONSTRAINT IF EXISTS glpm_team_domain_ratings_domain_check;

ALTER TABLE glpm_team_domain_ratings
  ADD CONSTRAINT glpm_team_domain_ratings_domain_check
  CHECK (domain IN (
    -- Attack
    'creation', 'progression', 'situational',
    -- Defence (legacy + current)
    'suppression', 'organisation', 'special_teams',
    'prevention', 'protection', 'control',
    -- Build-Up
    'retention', 'distribution',
    -- Possession
    'ball_retention', 'territorial_control', 'possession_control',
    -- Pressing
    'press_intensity', 'ball_recovery', 'press_effectiveness'
  ));

CREATE INDEX IF NOT EXISTS idx_glpm_domain_ratings_type
  ON glpm_team_domain_ratings (rating_type, as_of_date DESC);
