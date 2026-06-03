-- Sofascore 2026 snapshot metadata on FIFA rankings

ALTER TABLE fifa_ranking_snapshots
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS sofascore_team_id int;

CREATE INDEX IF NOT EXISTS idx_fifa_ranking_sofascore_team
  ON fifa_ranking_snapshots (sofascore_team_id)
  WHERE sofascore_team_id IS NOT NULL;
