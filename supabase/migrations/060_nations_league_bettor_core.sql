-- UEFA Nations League 2026/27 bettor hub tables (isolated from world_cup_*)

BEGIN;

-- NL group codes are like A1, B3, D2 (widen WC CHAR(1) column)
ALTER TABLE matches
  ALTER COLUMN group_code TYPE TEXT;

CREATE TABLE IF NOT EXISTS nations_league_groups (
  league_tier CHAR(1) NOT NULL CHECK (league_tier IN ('A', 'B', 'C', 'D')),
  group_code TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams (id),
  sort_order INT NOT NULL,
  PRIMARY KEY (group_code, team_id)
);

CREATE INDEX IF NOT EXISTS idx_nl_groups_tier
  ON nations_league_groups (league_tier, group_code, sort_order);

CREATE TABLE IF NOT EXISTS nations_league_predictions (
  match_id TEXT PRIMARY KEY REFERENCES matches (id),
  home_win_pct NUMERIC(5, 4) NOT NULL,
  draw_pct NUMERIC(5, 4) NOT NULL,
  away_win_pct NUMERIC(5, 4) NOT NULL,
  fair_odds_home NUMERIC(5, 2) GENERATED ALWAYS AS (ROUND(1.0 / NULLIF(home_win_pct, 0), 2)) STORED,
  fair_odds_draw NUMERIC(5, 2) GENERATED ALWAYS AS (ROUND(1.0 / NULLIF(draw_pct, 0), 2)) STORED,
  fair_odds_away NUMERIC(5, 2) GENERATED ALWAYS AS (ROUND(1.0 / NULLIF(away_win_pct, 0), 2)) STORED,
  predicted_score_home INT NOT NULL,
  predicted_score_away INT NOT NULL,
  under_2_5_pct NUMERIC(5, 4) NOT NULL,
  over_2_5_pct NUMERIC(5, 4) NOT NULL,
  model_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_nl_predictions_computed
  ON nations_league_predictions (computed_at DESC);

CREATE TABLE IF NOT EXISTS nations_league_hub_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  refresh_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (refresh_status IN ('idle', 'running', 'failed')),
  last_manual_refresh_at TIMESTAMPTZ,
  last_cron_refresh_at TIMESTAMPTZ,
  refresh_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nations_league_calibration_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  effective_from timestamptz NOT NULL DEFAULT now(),
  constants jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_calibration_effective
  ON nations_league_calibration_config (effective_from DESC);

CREATE TABLE IF NOT EXISTS nations_league_post_match_ingests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES matches (id),
  source_path text,
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  article_text text,
  narrative_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_post_match_ingests_match
  ON nations_league_post_match_ingests (match_id, ingested_at DESC);

CREATE TABLE IF NOT EXISTS nations_league_player_match_stats (
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  opta_player_id text NOT NULL,
  player_name text NOT NULL,
  team_api_id int NOT NULL,
  side text NOT NULL CHECK (side IN ('home', 'away')),
  is_starter boolean NOT NULL DEFAULT false,
  position text,
  minutes int,
  opta_points numeric(6, 3),
  match_rank int,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, opta_player_id)
);

CREATE INDEX IF NOT EXISTS idx_nl_player_match_stats_team
  ON nations_league_player_match_stats (team_api_id, match_id);

CREATE TABLE IF NOT EXISTS nations_league_team_match_aggregates (
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  team_api_id int NOT NULL,
  side text NOT NULL CHECK (side IN ('home', 'away')),
  chance_index numeric(8, 4),
  finishing_delta numeric(6, 3),
  defensive_solidity numeric(8, 4),
  territory_index numeric(8, 4),
  gk_save_index numeric(8, 4),
  discipline_load numeric(8, 4),
  opponent_strength numeric(8, 3),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, team_api_id)
);

CREATE TABLE IF NOT EXISTS nations_league_player_tournament_form (
  team_api_id int NOT NULL,
  opta_player_id text NOT NULL,
  player_name text NOT NULL,
  matches_played int NOT NULL DEFAULT 0,
  minutes_total int NOT NULL DEFAULT 0,
  avg_opta_points numeric(6, 3),
  chance_index_per90 numeric(8, 4),
  defensive_actions_per90 numeric(8, 4),
  gk_save_index numeric(8, 4),
  yellow_cards int NOT NULL DEFAULT 0,
  was_last_starter boolean NOT NULL DEFAULT false,
  availability_factor numeric(6, 4),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_api_id, opta_player_id)
);

CREATE TABLE IF NOT EXISTS nations_league_player_stats_ingests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  source_paths jsonb NOT NULL DEFAULT '{}'::jsonb,
  parsed_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings text[] NOT NULL DEFAULT '{}',
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_player_stats_ingests_match
  ON nations_league_player_stats_ingests (match_id, ingested_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_nl_lookup
  ON matches (status, date, group_code)
  WHERE competition ILIKE '%Nations League%';

ALTER TABLE nations_league_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_hub_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_calibration_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_post_match_ingests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_player_match_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_team_match_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_player_tournament_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations_league_player_stats_ingests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_groups'
      AND policyname = 'nations_league_groups_select_public'
  ) THEN
    CREATE POLICY nations_league_groups_select_public ON nations_league_groups
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_predictions'
      AND policyname = 'nations_league_predictions_select_public'
  ) THEN
    CREATE POLICY nations_league_predictions_select_public ON nations_league_predictions
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_hub_snapshot'
      AND policyname = 'nations_league_hub_snapshot_read'
  ) THEN
    CREATE POLICY nations_league_hub_snapshot_read ON nations_league_hub_snapshot
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_calibration_config'
      AND policyname = 'nations_league_calibration_config_select_public'
  ) THEN
    CREATE POLICY nations_league_calibration_config_select_public
      ON nations_league_calibration_config FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_post_match_ingests'
      AND policyname = 'nations_league_post_match_ingests_select_public'
  ) THEN
    CREATE POLICY nations_league_post_match_ingests_select_public
      ON nations_league_post_match_ingests FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_player_match_stats'
      AND policyname = 'nations_league_player_match_stats_select_public'
  ) THEN
    CREATE POLICY nations_league_player_match_stats_select_public
      ON nations_league_player_match_stats FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_team_match_aggregates'
      AND policyname = 'nations_league_team_match_aggregates_select_public'
  ) THEN
    CREATE POLICY nations_league_team_match_aggregates_select_public
      ON nations_league_team_match_aggregates FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_player_tournament_form'
      AND policyname = 'nations_league_player_tournament_form_select_public'
  ) THEN
    CREATE POLICY nations_league_player_tournament_form_select_public
      ON nations_league_player_tournament_form FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nations_league_player_stats_ingests'
      AND policyname = 'nations_league_player_stats_ingests_select_public'
  ) THEN
    CREATE POLICY nations_league_player_stats_ingests_select_public
      ON nations_league_player_stats_ingests FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
