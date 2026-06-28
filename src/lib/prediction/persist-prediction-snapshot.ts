import type { SupabaseClient } from "@supabase/supabase-js";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";
import { wcVenueKickoffToUtcIso } from "@/lib/world-cup/match-kickoff";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { PredictionResult } from "@/lib/types/prediction";
import type { FixtureOption } from "@/lib/types/football-lookup";
import {
  pctToFraction,
  snapshotDateUtc,
  type PredictionSnapshotDomain,
  type PredictionSnapshotRow,
  type PredictionSnapshotRunRow,
  type PredictionSnapshotRunStatus,
} from "@/lib/prediction/snapshot-types";

function snapshotDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      upsert: (
        row: unknown,
        opts?: { onConflict?: string }
      ) => Promise<{ error: { message: string } | null }>;
      insert: (row: unknown) => Promise<{
        data: Array<{ id: string }> | null;
        error: { message: string } | null;
      }>;
      update: (row: unknown) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

export async function persistPredictionSnapshot(
  client: SupabaseClient,
  row: PredictionSnapshotRow
): Promise<string | null> {
  const { error } = await snapshotDb(client)
    .from("prediction_snapshots")
    .upsert(row, { onConflict: "snapshot_date,domain,match_key" });
  return error?.message ?? null;
}

export async function startPredictionSnapshotRun(
  client: SupabaseClient,
  domain: PredictionSnapshotDomain | "all",
  snapshotDate: string = snapshotDateUtc()
): Promise<string | null> {
  const { data, error } = await snapshotDb(client).from("prediction_snapshot_runs").insert({
    snapshot_date: snapshotDate,
    domain,
    status: "running",
    fixtures_attempted: 0,
    snapshots_written: 0,
    errors: [],
  });
  if (error) return null;
  return data?.[0]?.id ?? null;
}

export async function finishPredictionSnapshotRun(
  client: SupabaseClient,
  runId: string,
  patch: {
    status: PredictionSnapshotRunStatus;
    fixtures_attempted: number;
    snapshots_written: number;
    errors: string[];
  }
): Promise<void> {
  await snapshotDb(client)
    .from("prediction_snapshot_runs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export function buildWcSnapshotRow(input: {
  match: WcMatchRow;
  pred: HubPredictionRow;
  source: string;
  snapshotDate?: string;
  computedAt?: string;
}): PredictionSnapshotRow {
  const kickoff =
    wcVenueKickoffToUtcIso({
      date: input.match.date,
      time: input.match.time,
      venueCity: input.match.venue_city,
    }) ?? `${input.match.date ?? snapshotDateUtc()}T12:00:00.000Z`;

  const snap = input.pred.snapshot ?? {};
  const homeXg = Number(snap.home_xg ?? snap.lambda ?? NaN);
  const awayXg = Number(snap.away_xg ?? snap.mu ?? NaN);

  return {
    snapshot_date: input.snapshotDate ?? snapshotDateUtc(),
    domain: "world_cup",
    match_key: String(input.match.id),
    competition: input.match.competition ?? "FIFA World Cup 2026",
    league_id: null,
    season: 2026,
    match_kickoff_at: kickoff,
    home_team_id: String(input.match.home_team_id ?? ""),
    away_team_id: String(input.match.away_team_id ?? ""),
    home_team_name: input.match.home_team_name ?? null,
    away_team_name: input.match.away_team_name ?? null,
    venue_city: input.match.venue_city ?? input.match.venue ?? null,
    home_win_pct: input.pred.home_win_pct,
    draw_pct: input.pred.draw_pct,
    away_win_pct: input.pred.away_win_pct,
    predicted_score_home: input.pred.predicted_score_home,
    predicted_score_away: input.pred.predicted_score_away,
    home_xg: Number.isFinite(homeXg) ? homeXg : null,
    away_xg: Number.isFinite(awayXg) ? awayXg : null,
    under_2_5_pct: input.pred.under_2_5_pct,
    over_2_5_pct: input.pred.over_2_5_pct,
    model_version: input.pred.model_version,
    entity_type: "national",
    source: input.source,
    snapshot: snap,
    analytics_snapshot: null,
    computed_at: input.computedAt ?? new Date().toISOString(),
  };
}

export function buildLeagueSnapshotRow(input: {
  fixture: FixtureOption;
  result: PredictionResult;
  source: string;
  snapshotDate?: string;
  computedAt?: string;
}): PredictionSnapshotRow {
  const kickoff = input.fixture.date;
  const league = input.fixture.league;

  return {
    snapshot_date: input.snapshotDate ?? snapshotDateUtc(),
    domain: "league",
    match_key: String(input.fixture.id),
    competition: league.name,
    league_id: league.id,
    season: league.season,
    match_kickoff_at: kickoff,
    home_team_id: String(input.fixture.home.id),
    away_team_id: String(input.fixture.away.id),
    home_team_name: input.fixture.home.name,
    away_team_name: input.fixture.away.name,
    venue_city: input.fixture.venueCity,
    home_win_pct: pctToFraction(input.result.homeWinPct),
    draw_pct: pctToFraction(input.result.drawPct),
    away_win_pct: pctToFraction(input.result.awayWinPct),
    predicted_score_home: null,
    predicted_score_away: null,
    home_xg: input.result.expectedGoals.home,
    away_xg: input.result.expectedGoals.away,
    under_2_5_pct: null,
    over_2_5_pct: null,
    model_version: input.result.modelVersion ?? "v2.1",
    entity_type: "club",
    source: input.source,
    snapshot: {
      explanation: input.result.explanation,
      estimated: input.result.estimated,
      teamComparison: input.result.teamComparison ?? null,
    },
    analytics_snapshot: (input.result.analytics as Record<string, unknown> | undefined) ?? null,
    computed_at: input.computedAt ?? new Date().toISOString(),
  };
}

export async function persistWcHubPredictionSnapshot(
  client: SupabaseClient,
  match: WcMatchRow,
  pred: HubPredictionRow,
  source = "wc_hub_sync"
): Promise<string | null> {
  return persistPredictionSnapshot(client, buildWcSnapshotRow({ match, pred, source }));
}

export type { PredictionSnapshotRow, PredictionSnapshotRunRow };
