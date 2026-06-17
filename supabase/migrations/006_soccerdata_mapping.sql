-- SoccerData ↔ SofaScore mapping + enrichments
-- Canonical IDs remain SofaScore/SportAPI (team_id, event_id).

CREATE TABLE IF NOT EXISTS soccerdata_team_aliases (
  league_id int NOT NULL,
  team_id int NOT NULL,
  source text NOT NULL, -- FBref | Understat | SoFIFA | MatchHistory | Sofascore | ESPN | WhoScored | ClubElo
  soccerdata_team_name text NOT NULL,
  normalized_team_name text NOT NULL,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, team_id, source)
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_team_aliases_lookup
  ON soccerdata_team_aliases (source, league_id, normalized_team_name);

CREATE TABLE IF NOT EXISTS soccerdata_match_links (
  event_id int NOT NULL,
  league_id int NOT NULL,
  source text NOT NULL,
  soccerdata_match_key text NOT NULL,
  kickoff_at timestamptz,
  home_team_id int,
  away_team_id int,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  linked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, source)
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_match_links_key
  ON soccerdata_match_links (source, soccerdata_match_key);

-- Canonical player identity is unresolved; store a platform-scoped player row
-- and link it to per-source identifiers.
CREATE TABLE IF NOT EXISTS soccerdata_players (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  league_id int,
  team_id int,
  position text,
  country text,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_players_team ON soccerdata_players (team_id);

CREATE TABLE IF NOT EXISTS soccerdata_player_links (
  player_id bigint NOT NULL REFERENCES soccerdata_players (id) ON DELETE CASCADE,
  source text NOT NULL,
  soccerdata_player_key text NOT NULL,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, source)
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_player_links_key
  ON soccerdata_player_links (source, soccerdata_player_key);

-- Fast-path enrichments linked to canonical event_id/team_id.
CREATE TABLE IF NOT EXISTS soccerdata_event_enrichments (
  event_id int PRIMARY KEY,
  league_id int,
  season int,
  xg_home numeric(6, 3),
  xg_away numeric(6, 3),
  odds_home numeric(10, 4),
  odds_draw numeric(10, 4),
  odds_away numeric(10, 4),
  payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soccerdata_event_enrichments_league
  ON soccerdata_event_enrichments (league_id, season);

ALTER TABLE soccerdata_team_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_match_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_player_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE soccerdata_event_enrichments ENABLE ROW LEVEL SECURITY;

-- Public read, service-role writes (no write policies).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_team_aliases' AND policyname = 'soccerdata_team_aliases_select'
  ) THEN
    CREATE POLICY "soccerdata_team_aliases_select" ON soccerdata_team_aliases
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_match_links' AND policyname = 'soccerdata_match_links_select'
  ) THEN
    CREATE POLICY "soccerdata_match_links_select" ON soccerdata_match_links
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_players' AND policyname = 'soccerdata_players_select'
  ) THEN
    CREATE POLICY "soccerdata_players_select" ON soccerdata_players
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_player_links' AND policyname = 'soccerdata_player_links_select'
  ) THEN
    CREATE POLICY "soccerdata_player_links_select" ON soccerdata_player_links
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'soccerdata_event_enrichments' AND policyname = 'soccerdata_event_enrichments_select'
  ) THEN
    CREATE POLICY "soccerdata_event_enrichments_select" ON soccerdata_event_enrichments
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

