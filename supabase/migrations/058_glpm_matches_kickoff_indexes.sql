-- Speeds Home live-scores + kickoff-window lookups on glpm_matches.
-- Hot paths filter by kickoff_at range, often with league_sm_id / season_id.

CREATE INDEX IF NOT EXISTS idx_glpm_matches_kickoff_at
  ON public.glpm_matches (kickoff_at ASC);

CREATE INDEX IF NOT EXISTS idx_glpm_matches_league_kickoff
  ON public.glpm_matches (league_sm_id, kickoff_at ASC);

CREATE INDEX IF NOT EXISTS idx_glpm_matches_season_kickoff
  ON public.glpm_matches (season_id, kickoff_at ASC);

COMMENT ON INDEX public.idx_glpm_matches_kickoff_at IS
  'Range scans / ORDER BY kickoff_at (live board day window).';

COMMENT ON INDEX public.idx_glpm_matches_league_kickoff IS
  'Live poll window + DEFAULT_GLPM_LEAGUE_IDS filters.';

COMMENT ON INDEX public.idx_glpm_matches_season_kickoff IS
  'Hub / home pack fixture lists by season ordered by kickoff.';
