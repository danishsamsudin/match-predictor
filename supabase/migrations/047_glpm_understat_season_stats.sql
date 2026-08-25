-- Understat (or compatible) season-aggregate xG imports for GLPM calibration / priors.
-- Season totals only (not match grain). Soft ID refs (no FKs) so this applies even
-- when run before GLPM core tables exist, or when IDs are filled in later by import.

CREATE TABLE IF NOT EXISTS glpm_understat_team_season (
  season_label text NOT NULL,
  season_sm_id bigint,
  competition_sm_id bigint,
  team_name text NOT NULL,
  team_sm_id bigint,
  league_rank int,
  matches int NOT NULL DEFAULT 0,
  wins int NOT NULL DEFAULT 0,
  draws int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  goals_for int NOT NULL DEFAULT 0,
  goals_against int NOT NULL DEFAULT 0,
  points int NOT NULL DEFAULT 0,
  xg numeric(10, 4) NOT NULL DEFAULT 0,
  xga numeric(10, 4) NOT NULL DEFAULT 0,
  xpts numeric(10, 4),
  xg_p90 numeric(10, 4),
  xga_p90 numeric(10, 4),
  goals_minus_xg numeric(10, 4),
  source text NOT NULL DEFAULT 'understat',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_label, team_name, source)
);

CREATE INDEX IF NOT EXISTS idx_glpm_understat_team_season_sm
  ON glpm_understat_team_season (season_sm_id, team_sm_id);

CREATE TABLE IF NOT EXISTS glpm_understat_player_season (
  season_label text NOT NULL,
  season_sm_id bigint,
  competition_sm_id bigint,
  player_name text NOT NULL,
  team_name text NOT NULL,
  team_sm_id bigint,
  player_sm_id bigint,
  appearances int NOT NULL DEFAULT 0,
  minutes int NOT NULL DEFAULT 0,
  goals int NOT NULL DEFAULT 0,
  assists int NOT NULL DEFAULT 0,
  xg numeric(10, 4) NOT NULL DEFAULT 0,
  xa numeric(10, 4) NOT NULL DEFAULT 0,
  xg90 numeric(10, 4),
  xa90 numeric(10, 4),
  source text NOT NULL DEFAULT 'understat',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_label, player_name, team_name, source)
);

CREATE INDEX IF NOT EXISTS idx_glpm_understat_player_season_team
  ON glpm_understat_player_season (season_sm_id, team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_understat_player_season_player
  ON glpm_understat_player_season (player_sm_id);

COMMENT ON TABLE glpm_understat_team_season IS
  'Season-aggregate team xG/xGA from Understat-style exports (not match grain).';

COMMENT ON TABLE glpm_understat_player_season IS
  'Season-aggregate player xG/xA from Understat-style exports.';
