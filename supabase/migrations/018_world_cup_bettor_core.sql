-- World Cup 2026 bettor hub: groups, predictions, discipline, performance indexes

BEGIN;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS group_code CHAR(1),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS venue_city TEXT,
  ADD COLUMN IF NOT EXISTS venue_altitude_meters INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rest_hours_home INT,
  ADD COLUMN IF NOT EXISTS rest_hours_away INT;

CREATE TABLE IF NOT EXISTS world_cup_groups (
  group_code CHAR(1) NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams (id),
  sort_order INT NOT NULL,
  PRIMARY KEY (group_code, team_id)
);

CREATE TABLE IF NOT EXISTS world_cup_predictions (
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

CREATE TABLE IF NOT EXISTS world_cup_team_discipline (
  team_id TEXT PRIMARY KEY REFERENCES teams (id),
  yellow_cards INT DEFAULT 0,
  indirect_red_cards INT DEFAULT 0,
  direct_red_cards INT DEFAULT 0,
  total_fair_play_points INT GENERATED ALWAYS AS (
    (yellow_cards * -1) + (indirect_red_cards * -3) + (direct_red_cards * -4)
  ) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_wc_lookup ON matches (status, date, group_code);

CREATE INDEX IF NOT EXISTS idx_matches_group_stage_perf
  ON matches (group_code, status, date DESC);

CREATE INDEX IF NOT EXISTS idx_predictions_fair_odds_lookup
  ON world_cup_predictions (match_id);

ALTER TABLE world_cup_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_team_discipline ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_groups' AND policyname = 'world_cup_groups_select_public'
  ) THEN
    CREATE POLICY world_cup_groups_select_public ON world_cup_groups
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_predictions' AND policyname = 'world_cup_predictions_select_public'
  ) THEN
    CREATE POLICY world_cup_predictions_select_public ON world_cup_predictions
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'world_cup_team_discipline' AND policyname = 'world_cup_team_discipline_select_public'
  ) THEN
    CREATE POLICY world_cup_team_discipline_select_public ON world_cup_team_discipline
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

COMMIT;
