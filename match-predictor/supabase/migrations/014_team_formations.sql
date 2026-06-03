-- Per-team formation usage (denormalized from match logs / synced lineups)

ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_formation text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_formation text;

CREATE TABLE IF NOT EXISTS team_formation_usage (
  reference_team_id integer NOT NULL,
  formation text NOT NULL,
  match_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'fbref',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_formation_usage_pkey PRIMARY KEY (reference_team_id, formation, source)
);

CREATE INDEX IF NOT EXISTS idx_team_formation_usage_team
  ON team_formation_usage (reference_team_id);

ALTER TABLE team_formation_usage ENABLE ROW LEVEL SECURITY;
