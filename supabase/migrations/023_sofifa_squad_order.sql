ALTER TABLE soccerdata_players
  ADD COLUMN IF NOT EXISTS squad_order int;

CREATE INDEX IF NOT EXISTS idx_soccerdata_players_squad_order
  ON soccerdata_players (team_id, is_starter DESC, squad_order ASC);
