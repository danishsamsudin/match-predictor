-- SoFIFA World Cup squad lineup slots (starters vs bench, tactical position)

ALTER TABLE soccerdata_players
  ADD COLUMN IF NOT EXISTS is_starter boolean,
  ADD COLUMN IF NOT EXISTS field_position text,
  ADD COLUMN IF NOT EXISTS jersey_number int,
  ADD COLUMN IF NOT EXISTS sofifa_potential numeric(5, 2);

CREATE INDEX IF NOT EXISTS idx_soccerdata_players_starter
  ON soccerdata_players (team_id, is_starter DESC, sofifa_overall DESC);
