-- GLPM: SportMonks primary IDs + Wyscout secondary enrichment
-- Recreates glpm_* tables with sm_id PKs (030 tables assumed empty / safe to replace).

-- ---------------------------------------------------------------------------
-- Drop 030 Wyscout-centric objects
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS glpm_match_team_features CASCADE;
DROP TABLE IF EXISTS glpm_match_vs_style CASCADE;
DROP TABLE IF EXISTS glpm_team_style_snapshots CASCADE;
DROP TABLE IF EXISTS glpm_match_player_stats CASCADE;
DROP TABLE IF EXISTS glpm_match_shots CASCADE;
DROP TABLE IF EXISTS glpm_match_events CASCADE;
DROP TABLE IF EXISTS glpm_match_team_stats CASCADE;
DROP TABLE IF EXISTS glpm_matches CASCADE;
DROP TABLE IF EXISTS glpm_players CASCADE;
DROP TABLE IF EXISTS glpm_teams CASCADE;
DROP TABLE IF EXISTS glpm_seasons CASCADE;
DROP TABLE IF EXISTS glpm_competitions CASCADE;
DROP TABLE IF EXISTS glpm_validation_logs CASCADE;
DROP TABLE IF EXISTS glpm_wyscout_payloads CASCADE;
DROP TABLE IF EXISTS glpm_provider_payloads CASCADE;
DROP TABLE IF EXISTS glpm_provider_entity_map CASCADE;

-- ---------------------------------------------------------------------------
-- Provider-agnostic raw audit
-- ---------------------------------------------------------------------------
CREATE TABLE glpm_provider_payloads (
  provider text NOT NULL CHECK (provider IN ('sportmonks', 'wyscout')),
  endpoint text NOT NULL,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, endpoint, entity_type, entity_key)
);

-- ---------------------------------------------------------------------------
-- Dimensions (SportMonks canonical sm_id)
-- ---------------------------------------------------------------------------
CREATE TABLE glpm_competitions (
  sm_id bigint PRIMARY KEY,
  name text NOT NULL,
  area_id bigint,
  area_name text,
  format text,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE glpm_seasons (
  sm_id bigint PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES glpm_competitions (sm_id),
  name text,
  start_date date,
  end_date date,
  active boolean NOT NULL DEFAULT false,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glpm_seasons_competition ON glpm_seasons (competition_id);

CREATE TABLE glpm_teams (
  sm_id bigint PRIMARY KEY,
  name text NOT NULL,
  official_name text,
  city text,
  area_name text,
  stadium_name text,
  stadium_capacity int,
  altitude numeric(8, 2),
  promotion_status text,
  manager_sm_id bigint,
  manager_name text,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE glpm_players (
  sm_id bigint PRIMARY KEY,
  current_team_sm_id bigint REFERENCES glpm_teams (sm_id),
  short_name text,
  first_name text,
  last_name text,
  birth_date date,
  height_cm int,
  foot text,
  role_code text,
  role_name text,
  status text,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glpm_players_team ON glpm_players (current_team_sm_id);

CREATE TABLE glpm_matches (
  sm_id bigint PRIMARY KEY,
  competition_id bigint REFERENCES glpm_competitions (sm_id),
  season_id bigint REFERENCES glpm_seasons (sm_id),
  league_sm_id bigint,
  state_id int,
  venue_sm_id bigint,
  round_sm_id bigint,
  gameweek int,
  match_date date,
  kickoff_at timestamptz,
  home_team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  away_team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  venue text,
  referee_sm_id bigint,
  status text,
  home_score int,
  away_score int,
  duration_minutes int,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glpm_matches_competition_date ON glpm_matches (competition_id, match_date DESC);
CREATE INDEX idx_glpm_matches_season ON glpm_matches (season_id, gameweek);
CREATE INDEX idx_glpm_matches_teams ON glpm_matches (home_team_sm_id, away_team_sm_id);
CREATE INDEX idx_glpm_matches_league ON glpm_matches (league_sm_id, match_date DESC);

-- ---------------------------------------------------------------------------
-- Provider entity crosswalk (Wyscout secondary IDs)
-- ---------------------------------------------------------------------------
CREATE TABLE glpm_provider_entity_map (
  entity_type text NOT NULL CHECK (entity_type IN ('competition', 'season', 'team', 'player', 'match')),
  sm_id bigint NOT NULL,
  provider text NOT NULL CHECK (provider IN ('wyscout')),
  provider_entity_id bigint NOT NULL,
  notes text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, sm_id, provider),
  UNIQUE (entity_type, provider, provider_entity_id)
);

CREATE INDEX idx_glpm_provider_entity_map_provider
  ON glpm_provider_entity_map (provider, entity_type, provider_entity_id);

-- ---------------------------------------------------------------------------
-- Layer 1: match team statistics
-- ---------------------------------------------------------------------------
CREATE TABLE glpm_match_team_stats (
  match_sm_id bigint NOT NULL REFERENCES glpm_matches (sm_id) ON DELETE CASCADE,
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  is_home boolean NOT NULL,
  goals int,
  xg numeric(8, 4),
  npxg numeric(8, 4),
  open_play_xg numeric(8, 4),
  set_piece_xg numeric(8, 4),
  shots int,
  shots_on_target int,
  big_chances int,
  box_entries int,
  touches_in_box int,
  progressive_passes int,
  progressive_carries int,
  final_third_entries int,
  crosses int,
  through_balls int,
  passes int,
  successful_passes int,
  xg_conceded numeric(8, 4),
  shots_conceded int,
  big_chances_conceded int,
  box_entries_allowed int,
  blocks int,
  interceptions int,
  tackles int,
  clearances int,
  pressures int,
  pressing_duels int,
  ppda numeric(8, 4),
  ball_recoveries int,
  high_turnovers int,
  defensive_actions int,
  possession_pct numeric(6, 3),
  pass_completion_pct numeric(6, 3),
  field_tilt numeric(6, 3),
  territory_pct numeric(6, 3),
  psxg_faced numeric(8, 4),
  gk_saves int,
  xg_source text CHECK (xg_source IS NULL OR xg_source IN ('sportmonks', 'wyscout')),
  psxg_source text CHECK (psxg_source IS NULL OR psxg_source IN ('sportmonks', 'wyscout')),
  ppda_source text CHECK (ppda_source IS NULL OR ppda_source IN ('wyscout')),
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'passed', 'flagged', 'warned')),
  source_endpoint text,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_sm_id, team_sm_id)
);

CREATE INDEX idx_glpm_match_team_stats_team ON glpm_match_team_stats (team_sm_id, match_sm_id);
CREATE INDEX idx_glpm_match_team_stats_validation ON glpm_match_team_stats (validation_status);

-- ---------------------------------------------------------------------------
-- Layer 1: events + shots
-- ---------------------------------------------------------------------------
CREATE TABLE glpm_match_events (
  event_id bigint PRIMARY KEY,
  match_sm_id bigint NOT NULL REFERENCES glpm_matches (sm_id) ON DELETE CASCADE,
  team_sm_id bigint REFERENCES glpm_teams (sm_id),
  player_sm_id bigint,
  source text NOT NULL DEFAULT 'sportmonks'
    CHECK (source IN ('sportmonks', 'wyscout')),
  match_period text,
  event_sec numeric(12, 4),
  event_id_type int,
  event_name text,
  sub_event_id int,
  sub_event_name text,
  pos_x int,
  pos_y int,
  tags jsonb,
  xg numeric(8, 4),
  psxg numeric(8, 4),
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glpm_match_events_match ON glpm_match_events (match_sm_id, event_sec);
CREATE INDEX idx_glpm_match_events_source ON glpm_match_events (match_sm_id, source);

CREATE TABLE glpm_match_shots (
  event_id bigint PRIMARY KEY REFERENCES glpm_match_events (event_id) ON DELETE CASCADE,
  match_sm_id bigint NOT NULL REFERENCES glpm_matches (sm_id) ON DELETE CASCADE,
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  player_sm_id bigint,
  gk_player_sm_id bigint,
  source text NOT NULL DEFAULT 'wyscout'
    CHECK (source IN ('sportmonks', 'wyscout')),
  match_period text,
  event_sec numeric(12, 4),
  pos_x int,
  pos_y int,
  pre_shot_xg numeric(8, 4),
  post_shot_xg numeric(8, 4),
  is_on_target boolean,
  is_goal boolean NOT NULL DEFAULT false,
  is_penalty boolean NOT NULL DEFAULT false,
  is_set_piece boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  is_opportunity boolean NOT NULL DEFAULT false,
  is_counter_attack boolean NOT NULL DEFAULT false,
  body_part_tag int,
  goal_zone_tag int,
  tags jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glpm_match_shots_match_team ON glpm_match_shots (match_sm_id, team_sm_id);

CREATE TABLE glpm_match_player_stats (
  match_sm_id bigint NOT NULL REFERENCES glpm_matches (sm_id) ON DELETE CASCADE,
  player_sm_id bigint NOT NULL,
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  minutes_played numeric(6, 2),
  goals int,
  assists int,
  shots int,
  xg numeric(8, 4),
  psxg_faced numeric(8, 4),
  gk_saves int,
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_sm_id, player_sm_id)
);

CREATE INDEX idx_glpm_match_player_stats_team ON glpm_match_player_stats (match_sm_id, team_sm_id);

-- ---------------------------------------------------------------------------
-- Tactical profile facts
-- ---------------------------------------------------------------------------
CREATE TABLE glpm_team_style_snapshots (
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  season_id bigint NOT NULL REFERENCES glpm_seasons (sm_id),
  as_of_match_sm_id bigint REFERENCES glpm_matches (sm_id),
  as_of_date date NOT NULL,
  style_labels text[] NOT NULL DEFAULT '{}',
  possession_avg numeric(6, 3),
  ppda_avg numeric(8, 4),
  directness_avg numeric(8, 4),
  threshold_version text NOT NULL DEFAULT 'v1',
  metrics jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_sm_id, season_id, as_of_date)
);

CREATE TABLE glpm_match_vs_style (
  match_sm_id bigint NOT NULL REFERENCES glpm_matches (sm_id) ON DELETE CASCADE,
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  opponent_style text NOT NULL,
  xg_for numeric(8, 4),
  xg_against numeric(8, 4),
  shots int,
  ppda numeric(8, 4),
  field_tilt numeric(6, 3),
  metrics jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_sm_id, team_sm_id, opponent_style)
);

-- ---------------------------------------------------------------------------
-- Layer 2 features
-- ---------------------------------------------------------------------------
CREATE TABLE glpm_match_team_features (
  match_sm_id bigint NOT NULL REFERENCES glpm_matches (sm_id) ON DELETE CASCADE,
  team_sm_id bigint NOT NULL REFERENCES glpm_teams (sm_id),
  xg_per_shot numeric(8, 5),
  shot_conversion numeric(8, 5),
  big_chance_rate numeric(8, 5),
  box_shot_pct numeric(8, 5),
  progressive_pass_rate numeric(8, 5),
  field_tilt numeric(6, 3),
  ppda numeric(8, 4),
  ppda_event numeric(8, 4),
  psxg_faced numeric(8, 4),
  goals_prevented numeric(8, 4),
  psxg_save_pct numeric(8, 5),
  npxg numeric(8, 4),
  counter_efficiency numeric(8, 5),
  goals_conceded int,
  feature_version text NOT NULL DEFAULT 'v1',
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_sm_id, team_sm_id)
);

CREATE TABLE glpm_validation_logs (
  id bigserial PRIMARY KEY,
  layer text NOT NULL CHECK (layer IN ('L1', 'L2')),
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  rule_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('error', 'warn')),
  message text NOT NULL,
  observed jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_glpm_validation_logs_entity
  ON glpm_validation_logs (entity_type, entity_key, created_at DESC);
CREATE INDEX idx_glpm_validation_logs_rule
  ON glpm_validation_logs (rule_code, severity);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE glpm_provider_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_provider_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_match_team_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_match_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_match_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_team_style_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_match_vs_style ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_match_team_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE glpm_validation_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'glpm_provider_payloads',
    'glpm_provider_entity_map',
    'glpm_competitions',
    'glpm_seasons',
    'glpm_teams',
    'glpm_players',
    'glpm_matches',
    'glpm_match_team_stats',
    'glpm_match_events',
    'glpm_match_shots',
    'glpm_match_player_stats',
    'glpm_team_style_snapshots',
    'glpm_match_vs_style',
    'glpm_match_team_features',
    'glpm_validation_logs'
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
