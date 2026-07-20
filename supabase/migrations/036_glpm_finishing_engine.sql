-- GLPM Finishing engine (Chapter 9).
-- Expands component/domain CHECKs for Shot Execution / Chance Conversion /
-- Finishing Composure hierarchy. Primary rating_type 'finishing' already allowed.

-- ---------------------------------------------------------------------------
-- Component ratings CHECK
-- ---------------------------------------------------------------------------
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
    'recovery_efficiency', 'press_success', 'press_resistance_disruption',
    -- Finishing (Ch 9)
    'shot_accuracy', 'shot_technique', 'finishing_efficiency',
    'clinical_finishing', 'one_on_one_finishing', 'pressure_finishing'
  ));

-- ---------------------------------------------------------------------------
-- Domain ratings CHECK
-- ---------------------------------------------------------------------------
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
    'press_intensity', 'ball_recovery', 'press_effectiveness',
    -- Finishing (Ch 9)
    'shot_execution', 'chance_conversion', 'finishing_composure'
  ));
