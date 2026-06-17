-- FBref World Cup 2026 scrape store (teams, managers, matches, players, lineups)

CREATE TABLE IF NOT EXISTS teams (
  id text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS managers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  team_id text NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  CONSTRAINT managers_name_team_unique UNIQUE (name, team_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id text PRIMARY KEY,
  date date,
  time time,
  venue text,
  home_team_id text REFERENCES teams (id),
  away_team_id text REFERENCES teams (id),
  attendance integer,
  referee text,
  home_manager_id integer REFERENCES managers (id),
  away_manager_id integer REFERENCES managers (id)
);

CREATE TABLE IF NOT EXISTS players (
  id text PRIMARY KEY,
  name text NOT NULL,
  current_team_id text REFERENCES teams (id)
);

CREATE TABLE IF NOT EXISTS lineups (
  id uuid PRIMARY KEY,
  match_id text NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES players (id),
  team_id text NOT NULL REFERENCES teams (id),
  is_starting boolean NOT NULL DEFAULT false,
  jersey_number integer,
  position text,
  CONSTRAINT lineups_match_player_team_unique UNIQUE (match_id, player_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_date ON matches (date);
CREATE INDEX IF NOT EXISTS idx_lineups_match ON lineups (match_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players (current_team_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
