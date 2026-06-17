-- API response cache with TTL
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('football', 'weather')),
  response jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON api_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_api_cache_provider ON api_cache (provider);

-- Daily API usage counters for rate limiting
CREATE TABLE IF NOT EXISTS api_usage_daily (
  provider text NOT NULL CHECK (provider IN ('football', 'weather')),
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  call_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, usage_date)
);

-- Persisted prediction results
CREATE TABLE IF NOT EXISTS predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id int NOT NULL,
  home_team_id int NOT NULL,
  away_team_id int NOT NULL,
  city text NOT NULL,
  match_date timestamptz NOT NULL,
  home_win_pct numeric(5, 2) NOT NULL,
  away_win_pct numeric(5, 2) NOT NULL,
  draw_pct numeric(5, 2) NOT NULL,
  home_xg numeric(4, 2) NOT NULL,
  away_xg numeric(4, 2) NOT NULL,
  estimated_corners numeric(5, 1) NOT NULL,
  estimated_fouls numeric(5, 1) NOT NULL,
  estimated_yellow_cards numeric(4, 1) NOT NULL,
  estimated_red_cards numeric(3, 1) NOT NULL,
  explanation text NOT NULL,
  inputs_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions (match_id);

-- Row Level Security
ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Predictions: public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'predictions' AND policyname = 'predictions_select_anon'
  ) THEN
    CREATE POLICY "predictions_select_anon" ON predictions
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Cache and usage tables: no public policies (service role only)
