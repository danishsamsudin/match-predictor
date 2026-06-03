-- Ensure upsert on_conflict targets exist (safe if 010 already applied).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'managers_name_team_unique'
  ) THEN
    ALTER TABLE managers
      ADD CONSTRAINT managers_name_team_unique UNIQUE (name, team_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lineups_match_player_team_unique'
  ) THEN
    ALTER TABLE lineups
      ADD CONSTRAINT lineups_match_player_team_unique
      UNIQUE (match_id, player_id, team_id);
  END IF;
END $$;
