/** UTC calendar date (YYYY-MM-DD) for snapshot bucketing. */
export function snapshotDateUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Inclusive UTC bounds for fixtures kicking off on a calendar day. */
export function utcDayBounds(dateYmd: string): { start: string; end: string } {
  const day = dateYmd.slice(0, 10);
  return {
    start: `${day}T00:00:00.000Z`,
    end: `${day}T23:59:59.999Z`,
  };
}

/** Convert league engine percentages (0–100) to stored fractions (0–1). */
export function pctToFraction(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? Number((n / 100).toFixed(4)) : Number(n.toFixed(4));
}

export type PredictionSnapshotDomain = "world_cup" | "league";

export type PredictionSnapshotRow = {
  snapshot_date: string;
  domain: PredictionSnapshotDomain;
  match_key: string;
  competition?: string | null;
  league_id?: number | null;
  season?: number | null;
  match_kickoff_at: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name?: string | null;
  away_team_name?: string | null;
  venue_city?: string | null;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  predicted_score_home?: number | null;
  predicted_score_away?: number | null;
  home_xg?: number | null;
  away_xg?: number | null;
  under_2_5_pct?: number | null;
  over_2_5_pct?: number | null;
  model_version: string;
  entity_type?: string;
  source: string;
  snapshot: Record<string, unknown>;
  analytics_snapshot?: Record<string, unknown> | null;
  computed_at: string;
};

export type PredictionSnapshotRunStatus = "running" | "completed" | "failed";

export type PredictionSnapshotRunRow = {
  id: string;
  snapshot_date: string;
  domain: PredictionSnapshotDomain | "all";
  started_at: string;
  finished_at: string | null;
  status: PredictionSnapshotRunStatus;
  fixtures_attempted: number;
  snapshots_written: number;
  errors: string[];
};
