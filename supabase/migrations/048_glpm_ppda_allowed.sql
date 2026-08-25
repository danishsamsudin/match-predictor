-- Match-level PPDA Allowed + Understat as a ppda_source.
-- Historical wyscout rows remain valid in the CHECK; new writes use understat | sportmonks_proxy.

ALTER TABLE glpm_match_team_stats
  ADD COLUMN IF NOT EXISTS ppda_allowed numeric(8, 4);

ALTER TABLE glpm_match_team_features
  ADD COLUMN IF NOT EXISTS ppda_allowed numeric(8, 4);

ALTER TABLE glpm_match_team_stats
  DROP CONSTRAINT IF EXISTS glpm_match_team_stats_ppda_source_check;

ALTER TABLE glpm_match_team_stats
  ADD CONSTRAINT glpm_match_team_stats_ppda_source_check
  CHECK (
    ppda_source IS NULL
    OR ppda_source IN ('wyscout', 'understat', 'sportmonks_proxy')
  );

COMMENT ON COLUMN glpm_match_team_stats.ppda_allowed IS
  'Opponent pressing intensity (PPDA faced). Understat ppda_allowed, or sibling team ppda for SportMonks proxy.';

COMMENT ON COLUMN glpm_match_team_features.ppda_allowed IS
  'Layer-2 copy of glpm_match_team_stats.ppda_allowed.';
