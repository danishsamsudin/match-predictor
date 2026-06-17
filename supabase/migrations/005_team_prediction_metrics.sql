-- Prediction-ready metrics aligned with TeamStatAverages (engine formulas)

ALTER TABLE synced_teams
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS unique_tournament_id int,
  ADD COLUMN IF NOT EXISTS season_id int;

ALTER TABLE synced_team_statistics
  ADD COLUMN IF NOT EXISTS metrics_home jsonb,
  ADD COLUMN IF NOT EXISTS metrics_away jsonb;

COMMENT ON COLUMN synced_team_statistics.metrics_home IS
  'TeamStatAverages for home-side parseTeamStats (goalsFor, goalsAgainst, corners, fouls, cards, shotsOnTarget)';
COMMENT ON COLUMN synced_team_statistics.metrics_away IS
  'TeamStatAverages for away-side parseTeamStats';

CREATE INDEX IF NOT EXISTS idx_synced_team_statistics_league
  ON synced_team_statistics (reference_league_id, team_id);
