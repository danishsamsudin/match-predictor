-- WC 2026 player-level match stats + tournament form composites

BEGIN;

CREATE TABLE IF NOT EXISTS world_cup_player_match_stats (
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

CREATE INDEX IF NOT EXISTS idx_wc_player_match_stats_team
  ON world_cup_player_match_stats (team_api_id, match_id);

CREATE INDEX IF NOT EXISTS idx_wc_player_match_stats_match
  ON world_cup_player_match_stats (match_id);

CREATE TABLE IF NOT EXISTS world_cup_team_match_aggregates (
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

CREATE INDEX IF NOT EXISTS idx_wc_team_match_agg_team
  ON world_cup_team_match_aggregates (team_api_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS world_cup_player_tournament_form (
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

CREATE INDEX IF NOT EXISTS idx_wc_player_tournament_form_team
  ON world_cup_player_tournament_form (team_api_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS world_cup_player_stats_ingests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  source_paths jsonb NOT NULL DEFAULT '{}'::jsonb,
  parsed_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings text[] NOT NULL DEFAULT '{}',
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc_player_stats_ingests_match
  ON world_cup_player_stats_ingests (match_id, ingested_at DESC);

ALTER TABLE world_cup_player_match_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_team_match_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_player_tournament_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_player_stats_ingests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_player_match_stats'
      AND policyname = 'world_cup_player_match_stats_select_public'
  ) THEN
    CREATE POLICY world_cup_player_match_stats_select_public
      ON world_cup_player_match_stats FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_team_match_aggregates'
      AND policyname = 'world_cup_team_match_aggregates_select_public'
  ) THEN
    CREATE POLICY world_cup_team_match_aggregates_select_public
      ON world_cup_team_match_aggregates FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_player_tournament_form'
      AND policyname = 'world_cup_player_tournament_form_select_public'
  ) THEN
    CREATE POLICY world_cup_player_tournament_form_select_public
      ON world_cup_player_tournament_form FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_player_stats_ingests'
      AND policyname = 'world_cup_player_stats_ingests_select_public'
  ) THEN
    CREATE POLICY world_cup_player_stats_ingests_select_public
      ON world_cup_player_stats_ingests FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
