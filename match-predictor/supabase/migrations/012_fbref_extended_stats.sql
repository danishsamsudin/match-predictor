-- Extended FBref data: match metadata and per-player stat tables from squad pages

ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS round text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS day_of_week text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS result text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_goals integer;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_goals integer;

CREATE TABLE IF NOT EXISTS player_season_stats (
  id uuid PRIMARY KEY,
  player_id text NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  stat_type text NOT NULL,
  competition text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT player_season_stats_unique UNIQUE (player_id, team_id, stat_type, competition)
);

CREATE INDEX IF NOT EXISTS idx_player_season_stats_player ON player_season_stats (player_id);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_team ON player_season_stats (team_id);

ALTER TABLE player_season_stats ENABLE ROW LEVEL SECURITY;
