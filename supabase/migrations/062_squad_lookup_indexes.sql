-- Speed up Nations League / national squad picker lookups.
-- Team-scoped fixture form + exact player-name enrichment queries.

CREATE INDEX IF NOT EXISTS idx_synced_fixtures_home_team_kickoff
  ON public.synced_fixtures (home_team_id, kickoff_at DESC);

CREATE INDEX IF NOT EXISTS idx_synced_fixtures_away_team_kickoff
  ON public.synced_fixtures (away_team_id, kickoff_at DESC);

CREATE INDEX IF NOT EXISTS idx_scoutlyst_player_snapshots_player_name
  ON public.scoutlyst_player_snapshots (player_name);

CREATE INDEX IF NOT EXISTS idx_soccerdata_players_name
  ON public.soccerdata_players (name);
