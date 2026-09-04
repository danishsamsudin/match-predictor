-- Allow Understat as a Layer-1 event / shot source (set-piece flags, xG, locations).

ALTER TABLE glpm_match_events
  DROP CONSTRAINT IF EXISTS glpm_match_events_source_check;

ALTER TABLE glpm_match_events
  ADD CONSTRAINT glpm_match_events_source_check
  CHECK (source IN ('sportmonks', 'wyscout', 'understat'));

ALTER TABLE glpm_match_shots
  DROP CONSTRAINT IF EXISTS glpm_match_shots_source_check;

ALTER TABLE glpm_match_shots
  ADD CONSTRAINT glpm_match_shots_source_check
  CHECK (source IN ('sportmonks', 'wyscout', 'understat'));

COMMENT ON COLUMN glpm_match_shots.source IS
  'Shot provider. understat fills is_set_piece / situation when Wyscout events are absent.';
