import {
  ensureFifaRankingsLoaded,
  getLatestFifaRankingForTeam,
} from "@/lib/data/fifa-rankings-store";
import { tryCreateServiceClient } from "@/lib/supabase";
import { ingestPendingOptaResults } from "@/lib/world-cup/auto-ingest-opta";
import {
  enrichSummaryFromNarrative,
  parseWcMatchSummaryFromIngest,
  type WcMatchSummary,
} from "@/lib/world-cup/match-summary";
import { enrichMatchEnvironment } from "@/lib/world-cup/enrich-matches";
import {
  buildTeamIdToGroupMap,
  loadGroupDraw,
  resolveGroupCode,
} from "@/lib/world-cup/group-draw";
import { loadHubSnapshotPayload } from "@/lib/world-cup/hub-snapshot";
import { WORLD_CUP_FINALS_COMPETITION_OR } from "@/lib/world-cup/match-query";
import { resolveFixtureScheduleMeta } from "@/lib/world-cup/fixture-venues";
import { parseHubPrediction } from "@/lib/world-cup/hub-prediction";
import { resolveMatchPhase } from "@/lib/world-cup/match-kickoff";
import { compareByKickoffAsc } from "@/lib/world-cup/sort-matches";
import { filterWorldCup2026GroupStageMatches } from "@/lib/world-cup/tournament-fixtures";
import type { GoldenBootPredictionPayload } from "@/lib/world-cup/golden-boot-prediction";
import { buildCompletePredictionsMap } from "@/lib/world-cup/run-tournament-forecast";
import { runGoldenBootForecast } from "@/lib/world-cup/run-golden-boot-forecast";
import { runDeterministicTournamentForecast } from "@/lib/world-cup/tournament-simulation";
import {
  toTournamentForecastPayload,
  type TournamentForecastPayload,
} from "@/lib/world-cup/tournament-forecast-payload";
import {
  buildKnockoutProjection,
  buildThirdPlaceCandidates,
  computeAllGroupStandings,
  computeThirdPlaceWildcards,
  type WcMatchRow,
} from "@/lib/world-cup/standings";

type HubMatchRow = WcMatchRow & { home_team_name: string; away_team_name: string };

const PREDICTION_COLUMNS =
  "match_id, home_win_pct, draw_pct, away_win_pct, predicted_score_home, predicted_score_away, under_2_5_pct, over_2_5_pct, model_version, computed_at, snapshot";

export type WorldCupHubPayload = {
  updatedAt: string;
  groupMatrix: Record<string, ReturnType<typeof computeAllGroupStandings>[string]>;
  thirdPlaceRanking: ReturnType<typeof computeThirdPlaceWildcards>;
  knockoutProjection: ReturnType<typeof buildKnockoutProjection>;
  tournamentForecast: TournamentForecastPayload | null;
  goldenBootPredictions: GoldenBootPredictionPayload | null;
  recent: Array<
    HubMatchRow & {
      match_summary: WcMatchSummary | null;
    }
  >;
  upcoming: Array<
    WcMatchRow & {
      home_team_name: string;
      away_team_name: string;
      prediction: Record<string, unknown> | null;
      home_fifa_rank: number | null;
      home_fifa_points: number | null;
      away_fifa_rank: number | null;
      away_fifa_points: number | null;
      predicted_score_home: number | null;
      predicted_score_away: number | null;
      match_phase: "pre" | "live" | "finished";
      prediction_locked: boolean;
      card_prediction: ReturnType<typeof parseHubPrediction>;
    }
  >;
};

export type BuildHubPayloadOptions = {
  /** Skip Opta file ingest (already run in sync). */
  skipIngest?: boolean;
};

function mapMatch(
  row: Record<string, unknown>,
  teamNames: Map<string, string>,
  teamToGroup: Map<string, string>
): HubMatchRow {
  const homeId = row.home_team_id as string | null;
  const awayId = row.away_team_id as string | null;
  return {
    id: row.id as string,
    date: row.date as string | null,
    time: row.time as string | null,
    competition: row.competition as string | null,
    round: row.round as string | null,
    group_code: resolveGroupCode({
      existing: row.group_code as string | null,
      competition: row.competition as string | null,
      round: row.round as string | null,
      date: row.date as string | null,
      homeTeamId: homeId,
      awayTeamId: awayId,
      teamToGroup,
    }),
    status:
      row.home_goals != null && row.away_goals != null
        ? "finished"
        : ((row.status as string | null) ?? "scheduled"),
    home_team_id: homeId,
    away_team_id: awayId,
    home_goals: row.home_goals as number | null,
    away_goals: row.away_goals as number | null,
    home_team_name: homeId ? (teamNames.get(homeId) ?? "Home") : "Home",
    away_team_name: awayId ? (teamNames.get(awayId) ?? "Away") : "Away",
    venue: (row.venue as string | null) ?? null,
    venue_city:
      (row.venue_city as string | null) ?? (row.venue as string | null) ?? null,
    venue_altitude_meters: row.venue_altitude_meters as number | null | undefined,
  };
}

function enrichMatchesForHub(
  matches: HubMatchRow[],
  teamNames: Map<string, string>,
  teamToGroup: Map<string, string>
): HubMatchRow[] {
  return matches.map((m) => {
    const patch = enrichMatchEnvironment(m, matches, teamNames, {
      teamToGroup,
      competition: m.competition,
      round: m.round,
    });
    const venueCity = patch.venue_city ?? m.venue_city ?? null;
    const venueLabel = patch.venue_label ?? patch.venue ?? m.venue ?? null;
    return {
      ...m,
      venue: patch.venue ?? m.venue ?? null,
      venue_city: venueCity,
      venue_label: venueLabel,
      venue_altitude_meters:
        patch.venue_altitude_meters ?? m.venue_altitude_meters ?? null,
      group_code: patch.group_code ?? m.group_code,
      status: patch.status ?? m.status,
    };
  });
}

function isMatchFinishedRow(m: HubMatchRow, ingestedMatchIds: Set<string>): boolean {
  if (ingestedMatchIds.has(m.id)) return true;
  if (m.status === "finished") return true;
  return m.home_goals != null && m.away_goals != null;
}

function latestIngestSummariesByMatch(
  rows: Array<Record<string, unknown>>
): Map<string, WcMatchSummary> {
  const byMatch = new Map<string, { at: string; summary: WcMatchSummary }>();
  for (const row of rows) {
    const matchId = row.match_id as string;
    const ingestedAt = (row.ingested_at as string) ?? "";
    let summary = parseWcMatchSummaryFromIngest(row.parsed);
    if (!summary) continue;
    summary = enrichSummaryFromNarrative(summary, row.narrative_features);
    const existing = byMatch.get(matchId);
    if (!existing || ingestedAt > existing.at) {
      byMatch.set(matchId, { at: ingestedAt, summary });
    }
  }
  return new Map([...byMatch.entries()].map(([id, v]) => [id, v.summary]));
}

type LiveMatchPatch = {
  home_goals: number | null;
  away_goals: number | null;
  status: string | null;
};

/** Patch snapshot goals/status from live `matches` rows (cheap read path). */
export async function mergeLiveMatchScoresIntoPayload(
  payload: WorldCupHubPayload
): Promise<WorldCupHubPayload> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return payload;

  const { data } = await supabase
    .from("matches")
    .select("id, home_goals, away_goals, status")
    .or(WORLD_CUP_FINALS_COMPETITION_OR);

  if (!data?.length) return payload;

  const liveById = new Map(
    data.map((r) => [
      r.id as string,
      {
        home_goals: r.home_goals as number | null,
        away_goals: r.away_goals as number | null,
        status: r.status as string | null,
      } satisfies LiveMatchPatch,
    ])
  );

  const patchRow = <T extends { id: string; home_goals: number | null; away_goals: number | null; status?: string | null }>(
    row: T
  ): T => {
    const live = liveById.get(row.id);
    if (!live) return row;
    return {
      ...row,
      home_goals: live.home_goals ?? row.home_goals,
      away_goals: live.away_goals ?? row.away_goals,
      status: live.status ?? row.status,
    };
  };

  return {
    ...payload,
    recent: payload.recent.map(patchRow),
    upcoming: payload.upcoming.map((m) => {
      const patched = patchRow(m);
      const matchPhase = resolveMatchPhase({
        status: patched.status ?? null,
        homeGoals: patched.home_goals,
        awayGoals: patched.away_goals,
        date: patched.date,
        time: patched.time,
        venueCity: patched.venue_city,
      });
      const cardPrediction = m.card_prediction
        ? { ...m.card_prediction, locked: matchPhase !== "pre" }
        : m.card_prediction;
      return {
        ...patched,
        match_phase: matchPhase,
        prediction_locked: matchPhase !== "pre",
        card_prediction: cardPrediction,
      };
    }),
  };
}

/**
 * Fast read path: load precomputed snapshot from Supabase (+ optional live score merge).
 */
export async function loadWorldCupHubPayload(): Promise<WorldCupHubPayload | null> {
  const snapshot = await loadHubSnapshotPayload();
  if (!snapshot?.updatedAt) return null;
  return mergeLiveMatchScoresIntoPayload(snapshot);
}

/**
 * Heavy write path: build full hub payload from DB (used by cron / manual refresh).
 */
export async function buildWorldCupHubPayload(
  options: BuildHubPayloadOptions = {}
): Promise<WorldCupHubPayload | null> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  if (!options.skipIngest) {
    try {
      await ingestPendingOptaResults(supabase);
    } catch (err) {
      console.warn("WC auto-ingest skipped:", err);
    }
  }

  const wcClient = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };

  const [teamsRes, matchesRes, discRes, predRes, forecastRes, ingestsRes] = await Promise.all([
    supabase.from("teams").select("id, name"),
    supabase
      .from("matches")
      .select(
        "id, date, time, venue, venue_city, venue_altitude_meters, competition, round, group_code, status, home_team_id, away_team_id, home_goals, away_goals"
      )
      .or(WORLD_CUP_FINALS_COMPETITION_OR)
      .order("date", { ascending: true }),
    wcClient.from("world_cup_team_discipline").select("team_id, total_fair_play_points"),
    wcClient.from("world_cup_predictions").select(PREDICTION_COLUMNS),
    wcClient.from("world_cup_tournament_projection").select("payload, computed_at"),
    wcClient
      .from("world_cup_post_match_ingests")
      .select("match_id, parsed, narrative_features, ingested_at"),
  ]);

  const teamNames = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name]));
  const teamToGroup = buildTeamIdToGroupMap(teamNames);
  const rawMatches: HubMatchRow[] = (matchesRes.data ?? []).map((r) =>
    mapMatch(r, teamNames, teamToGroup)
  );
  const scoped = filterWorldCup2026GroupStageMatches(rawMatches, teamToGroup);
  const matches = enrichMatchesForHub(scoped, teamNames, teamToGroup);

  const fairPlay = new Map(
    ((discRes.data ?? []) as Array<{ team_id: string; total_fair_play_points: number }>).map(
      (d) => [d.team_id, d.total_fair_play_points]
    )
  );

  const predByMatch = new Map(
    ((predRes.data ?? []) as Array<Record<string, unknown>>).map((p) => [
      p.match_id as string,
      p,
    ])
  );

  const groupMatrix = computeAllGroupStandings(matches, teamNames);
  const thirdCandidates = buildThirdPlaceCandidates(groupMatrix, fairPlay);
  const thirdPlaceRanking = computeThirdPlaceWildcards(thirdCandidates);

  const md3Finished = loadGroupDraw();
  const allMd3Done = Object.keys(md3Finished).every((code) => {
    const groupMatches = matches.filter((m) => m.group_code === code);
    return groupMatches.filter((m) => m.status === "scheduled").length === 0;
  });

  const knockoutProjection = buildKnockoutProjection(thirdPlaceRanking, allMd3Done);

  const ingestedMatchIds = new Set(
    ((ingestsRes.data ?? []) as Array<{ match_id: string }>).map((r) => r.match_id)
  );
  const summaryByMatchId = latestIngestSummariesByMatch(ingestsRes.data ?? []);

  const recent = matches
    .filter((m) => isMatchFinishedRow(m, ingestedMatchIds))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 12)
    .map((m) => ({
      ...m,
      match_summary: summaryByMatchId.get(m.id) ?? null,
    }));

  const upcoming = matches
    .filter((m) => !isMatchFinishedRow(m, ingestedMatchIds))
    .map((m) => {
      const official = resolveFixtureScheduleMeta({
        date: m.date,
        time: m.time,
        homeName: m.home_team_name,
        awayName: m.away_team_name,
      });
      return {
        ...m,
        date: official?.date?.trim() || m.date,
        time: official?.kickoff_time ?? m.time,
        home_team_name: m.home_team_name ?? "Home",
        away_team_name: m.away_team_name ?? "Away",
      };
    })
    .sort(compareByKickoffAsc)
    .map((m) => ({
      ...m,
      prediction: predByMatch.get(m.id) ?? null,
    }));

  const predRows = (predRes.data ?? []) as Array<{ computed_at?: string }>;
  let latestPred: string | null = null;
  for (const row of predRows) {
    const at = row.computed_at;
    if (at && (!latestPred || at > latestPred)) latestPred = at;
  }

  await ensureFifaRankingsLoaded();

  const upcomingEnriched = upcoming.map((m) => {
    const homeFifa = getLatestFifaRankingForTeam(m.home_team_name);
    const awayFifa = getLatestFifaRankingForTeam(m.away_team_name);
    const rawPred = m.prediction as Record<string, unknown> | null;
    const matchPhase = resolveMatchPhase({
      status: m.status,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      date: m.date,
      time: m.time,
      venueCity: m.venue_city,
    });
    const cardPrediction = parseHubPrediction(rawPred, matchPhase);
    return {
      ...m,
      prediction: null,
      home_fifa_rank: homeFifa?.rank ?? null,
      home_fifa_points: homeFifa?.points ?? null,
      away_fifa_rank: awayFifa?.rank ?? null,
      away_fifa_points: awayFifa?.points ?? null,
      match_phase: matchPhase,
      prediction_locked: matchPhase !== "pre",
      card_prediction: cardPrediction,
      predicted_score_home: cardPrediction?.predicted_score_home ?? null,
      predicted_score_away: cardPrediction?.predicted_score_away ?? null,
    };
  });

  const forecastRow =
    forecastRes.error == null ? (forecastRes.data ?? [])[0] : undefined;
  let tournamentForecast =
    (forecastRow?.payload as TournamentForecastPayload | undefined) ?? null;

  const predictionsByMatchId = buildCompletePredictionsMap(
    matches,
    (predRes.data ?? []) as Array<Record<string, unknown>>
  );

  if (!tournamentForecast || tournamentForecast.knockoutMatches.length === 0) {
    const liveForecast = await runDeterministicTournamentForecast({
      matches,
      teamNames,
      predictionsByMatchId,
      fairPlayByTeam: fairPlay,
      knockoutMode: "quick",
    });
    if (liveForecast && liveForecast.knockoutMatches.length > 0) {
      tournamentForecast = toTournamentForecastPayload(liveForecast);
    }
  }

  let goldenBootPredictions: GoldenBootPredictionPayload | null = null;
  try {
    goldenBootPredictions = await runGoldenBootForecast({
      client: supabase,
      forecast: tournamentForecast,
      groupMatches: matches,
      predictionsByMatchId,
      teamNames,
    });
  } catch (err) {
    console.warn("Golden Boot forecast failed:", err);
  }

  const forecastAt = forecastRow?.computed_at as string | undefined;
  const updatedAt =
    [latestPred, forecastAt, tournamentForecast?.computedAt, goldenBootPredictions?.computedAt]
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? new Date().toISOString();

  return {
    updatedAt,
    groupMatrix,
    thirdPlaceRanking,
    knockoutProjection,
    tournamentForecast,
    goldenBootPredictions,
    recent,
    upcoming: upcomingEnriched,
  };
}
