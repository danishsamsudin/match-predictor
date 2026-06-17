-- Extend soccerdata_players for rating enrichments

ALTER TABLE soccerdata_players
  ADD COLUMN IF NOT EXISTS sofifa_overall numeric(5, 2);

CREATE INDEX IF NOT EXISTS idx_soccerdata_players_sofifa
  ON soccerdata_players (team_id, sofifa_overall DESC);

