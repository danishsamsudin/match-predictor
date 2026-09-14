-- match-predictor: Performance Advisor - unindexed foreign keys (lint 0001)
-- Project: gvpdyngcbpxyuirqkurs
--
-- Safe to re-run (IF NOT EXISTS).
-- Paste into SQL Editor and Run, then Rerun Performance Advisor.
--
-- NOT included on purpose:
--   - unused_index: often false positives for new / rare-path indexes; do not mass-drop
--   - auth_db_connections_absolute: Dashboard setting (Auth -> connection strategy), not SQL

-- data_sync_state
CREATE INDEX IF NOT EXISTS idx_data_sync_state_last_run_id
  ON public.data_sync_state (last_run_id);

-- glpm_cx_prediction_history
CREATE INDEX IF NOT EXISTS idx_glpm_cx_prediction_history_away_team_sm_id
  ON public.glpm_cx_prediction_history (away_team_sm_id);

-- glpm match grain
CREATE INDEX IF NOT EXISTS idx_glpm_match_events_team_sm_id
  ON public.glpm_match_events (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_match_player_stats_team_sm_id
  ON public.glpm_match_player_stats (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_match_shots_team_sm_id
  ON public.glpm_match_shots (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_match_team_features_team_sm_id
  ON public.glpm_match_team_features (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_match_vs_style_team_sm_id
  ON public.glpm_match_vs_style (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_matches_away_team_sm_id
  ON public.glpm_matches (away_team_sm_id);

-- glpm player ratings
CREATE INDEX IF NOT EXISTS idx_glpm_player_component_ratings_season_id
  ON public.glpm_player_component_ratings (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_player_component_ratings_team_sm_id
  ON public.glpm_player_component_ratings (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_player_domain_ratings_season_id
  ON public.glpm_player_domain_ratings (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_player_domain_ratings_team_sm_id
  ON public.glpm_player_domain_ratings (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_player_primary_ratings_season_id
  ON public.glpm_player_primary_ratings (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_player_primary_ratings_team_sm_id
  ON public.glpm_player_primary_ratings (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_player_rating_history_season_id
  ON public.glpm_player_rating_history (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_player_rating_history_team_sm_id
  ON public.glpm_player_rating_history (team_sm_id);

-- glpm predictions / ratings / standings / style
CREATE INDEX IF NOT EXISTS idx_glpm_prediction_history_away_team_sm_id
  ON public.glpm_prediction_history (away_team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_rating_history_season_id
  ON public.glpm_rating_history (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_standings_current_team_sm_id
  ON public.glpm_standings_current (team_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_team_component_ratings_season_id
  ON public.glpm_team_component_ratings (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_team_domain_ratings_season_id
  ON public.glpm_team_domain_ratings (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_team_primary_ratings_season_id
  ON public.glpm_team_primary_ratings (season_id);

CREATE INDEX IF NOT EXISTS idx_glpm_team_style_snapshots_as_of_match_sm_id
  ON public.glpm_team_style_snapshots (as_of_match_sm_id);

CREATE INDEX IF NOT EXISTS idx_glpm_team_style_snapshots_season_id
  ON public.glpm_team_style_snapshots (season_id);

-- FBref world cup store
CREATE INDEX IF NOT EXISTS idx_lineups_player_id
  ON public.lineups (player_id);

CREATE INDEX IF NOT EXISTS idx_lineups_team_id
  ON public.lineups (team_id);

CREATE INDEX IF NOT EXISTS idx_managers_team_id
  ON public.managers (team_id);

CREATE INDEX IF NOT EXISTS idx_matches_away_manager_id
  ON public.matches (away_manager_id);

CREATE INDEX IF NOT EXISTS idx_matches_away_team_id
  ON public.matches (away_team_id);

CREATE INDEX IF NOT EXISTS idx_matches_home_manager_id
  ON public.matches (home_manager_id);

CREATE INDEX IF NOT EXISTS idx_matches_home_team_id
  ON public.matches (home_team_id);

-- scoutlyst / world cup groups
CREATE INDEX IF NOT EXISTS idx_scoutlyst_player_snapshots_import_batch_id
  ON public.scoutlyst_player_snapshots (import_batch_id);

CREATE INDEX IF NOT EXISTS idx_world_cup_groups_team_id
  ON public.world_cup_groups (team_id);

-- Verification: should return 0 rows after this migration
SELECT
  c.conrelid::regclass AS table_name,
  c.conname AS fkey_name,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND i.indisvalid
      AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey::smallint[]
  )
  AND c.conname IN (
    'data_sync_state_last_run_id_fkey',
    'glpm_cx_prediction_history_away_team_sm_id_fkey',
    'glpm_match_events_team_sm_id_fkey',
    'glpm_match_player_stats_team_sm_id_fkey',
    'glpm_match_shots_team_sm_id_fkey',
    'glpm_match_team_features_team_sm_id_fkey',
    'glpm_match_vs_style_team_sm_id_fkey',
    'glpm_matches_away_team_sm_id_fkey',
    'glpm_player_component_ratings_season_id_fkey',
    'glpm_player_component_ratings_team_sm_id_fkey',
    'glpm_player_domain_ratings_season_id_fkey',
    'glpm_player_domain_ratings_team_sm_id_fkey',
    'glpm_player_primary_ratings_season_id_fkey',
    'glpm_player_primary_ratings_team_sm_id_fkey',
    'glpm_player_rating_history_season_id_fkey',
    'glpm_player_rating_history_team_sm_id_fkey',
    'glpm_prediction_history_away_team_sm_id_fkey',
    'glpm_rating_history_season_id_fkey',
    'glpm_standings_current_team_sm_id_fkey',
    'glpm_team_component_ratings_season_id_fkey',
    'glpm_team_domain_ratings_season_id_fkey',
    'glpm_team_primary_ratings_season_id_fkey',
    'glpm_team_style_snapshots_as_of_match_sm_id_fkey',
    'glpm_team_style_snapshots_season_id_fkey',
    'lineups_player_id_fkey',
    'lineups_team_id_fkey',
    'managers_team_id_fkey',
    'matches_away_manager_id_fkey',
    'matches_away_team_id_fkey',
    'matches_home_manager_id_fkey',
    'matches_home_team_id_fkey',
    'scoutlyst_player_snapshots_import_batch_id_fkey',
    'world_cup_groups_team_id_fkey'
  )
ORDER BY 1, 2;
