-- FIFA rankings can share the same rank within a snapshot (equal points).
-- Kaggle history includes many tied ranks; only one row per team per snapshot is required.

ALTER TABLE fifa_ranking_snapshots
  DROP CONSTRAINT IF EXISTS fifa_ranking_snapshots_unique_rank;
