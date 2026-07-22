-- Allow SportMonks PPDA proxy tag on team match stats.
ALTER TABLE glpm_match_team_stats
  DROP CONSTRAINT IF EXISTS glpm_match_team_stats_ppda_source_check;

ALTER TABLE glpm_match_team_stats
  ADD CONSTRAINT glpm_match_team_stats_ppda_source_check
  CHECK (ppda_source IS NULL OR ppda_source IN ('wyscout', 'sportmonks_proxy'));
