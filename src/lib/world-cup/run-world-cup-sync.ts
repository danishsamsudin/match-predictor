import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@/lib/supabase";
import { ingestPendingOptaResults } from "@/lib/world-cup/auto-ingest-opta";

/** Until Supabase types include world_cup_* tables from migration 018. */
function wcDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      upsert: (row: unknown) => Promise<{ error: { message: string } | null }>;
      update: (row: unknown) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
      select: (cols: string) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
}
import { enrichMatchEnvironment, deriveMatchStatus } from "@/lib/world-cup/enrich-matches";
import {
  buildTeamIdToGroupMap,
  resolveGroupCode,
} from "@/lib/world-cup/group-draw";
import { runHubMainPredict } from "@/lib/world-cup/hub-main-predict";
import { WORLD_CUP_FINALS_COMPETITION_OR } from "@/lib/world-cup/match-query";
import { filterWorldCup2026GroupStageMatches } from "@/lib/world-cup/tournament-fixtures";
import {
  buildR32HubMatchRows,
  isKnockoutSlotPlaceholder,
} from "@/lib/world-cup/r32-hub-fixtures";
import { buildR16HubMatchRows } from "@/lib/world-cup/r16-hub-fixtures";
import { buildQfHubMatchRows } from "@/lib/world-cup/qf-hub-fixtures";
import {
  resolveMatchPhase,
  shouldRefreshHubPrediction,
} from "@/lib/world-cup/match-kickoff";
import {
  buildCompletePredictionsMap,
  runAndPersistTournamentForecast,
} from "@/lib/world-cup/run-tournament-forecast";
import {
  computeAllGroupStandings,
  canonicalizeMatchResultForStandings,
  type WcMatchRow,
} from "@/lib/world-cup/standings";
import { persistWcHubPredictionSnapshot } from "@/lib/prediction/persist-prediction-snapshot";
import { enrichHubPredictionWithMarketModels } from "@/lib/world-cup/market-models/enrich-hub-prediction";
import { loadWcCalibrationConfig } from "@/lib/world-cup/wc-calibration-config";

export type WorldCupSyncResult = {
  ok: boolean;
  matchesEnriched: number;
  predictionsUpserted: number;
  tournamentForecastUpdated: boolean;
  optaIngested: number;
  errors: string[];
};

/** Parallel main-predict runs per batch (weather is cached per city+date). */
const PREDICT_BATCH_SIZE = 6;

type WcMatchWithMeta = WcMatchRow & {
  competition?: string | null;
  round?: string | null;
};

function mapMatchRow(
  row: Record<string, unknown>,
  teamNames: Map<string, string>,
  teamToGroup: Map<string, string>
): WcMatchWithMeta {
  const homeId = row.home_team_id as string | null;
  const awayId = row.away_team_id as string | null;
  const competition = row.competition as string | null;
  const round = row.round as string | null;
  const date = row.date as string | null;
  return {
    id: row.id as string,
    date,
    time: row.time as string | null,
    group_code: resolveGroupCode({
      existing: row.group_code as string | null,
      competition,
      round,
      date,
      homeTeamId: homeId,
      awayTeamId: awayId,
      teamToGroup,
    }),
    status: (row.status as string | null) ?? "scheduled",
    home_team_id: homeId,
    away_team_id: awayId,
    home_goals: row.home_goals as number | null,
    away_goals: row.away_goals as number | null,
    home_team_name: homeId ? teamNames.get(homeId) : undefined,
    away_team_name: awayId ? teamNames.get(awayId) : undefined,
    venue_city: (row.venue_city as string | null) ?? (row.venue as string | null),
    venue: row.venue as string | null,
    competition,
    round,
  };
}

async function upsertHubPrediction(
  client: SupabaseClient,
  match: WcMatchRow,
  pred: Awaited<ReturnType<typeof runHubMainPredict>>,
  calibration: Awaited<ReturnType<typeof loadWcCalibrationConfig>>
): Promise<string | null> {
  if (!pred) return "No prediction result";
  const enriched = enrichHubPredictionWithMarketModels({
    hubRow: pred,
    calibration,
    homeName: match.home_team_name,
    awayName: match.away_team_name,
    isKnockout: /round of|quarter-?final|semi-?final|third place|final\b|knockout/i.test(
      `${match.round ?? ""} ${match.competition ?? ""}`
    ),
  });
  const row = enriched.hubRow;
  const computedAt = new Date().toISOString();
  const { error } = await wcDb(client).from("world_cup_predictions").upsert({
    match_id: match.id,
    ...row,
    computed_at: computedAt,
  });
  if (error) return error.message;

  const snapErr = await persistWcHubPredictionSnapshot(client, match, row, "wc_hub_sync");
  return snapErr;
}

export async function runWorldCupHubSync(): Promise<WorldCupSyncResult> {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return {
      ok: false,
      matchesEnriched: 0,
      predictionsUpserted: 0,
      tournamentForecastUpdated: false,
      optaIngested: 0,
      errors: ["No Supabase client"],
    };
  }
  const client = supabase;

  const ingestResult = await ingestPendingOptaResults(client);
  const errors: string[] = [...ingestResult.errors];

  const { data: teams } = await client.from("teams").select("id, name");
  const teamNames = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const teamToGroup = buildTeamIdToGroupMap(teamNames);

  const { data: rawMatches, error: matchErr } = await client
    .from("matches")
    .select(
      "id, date, time, venue, round, competition, group_code, home_team_id, away_team_id, home_goals, away_goals"
    )
    .or(WORLD_CUP_FINALS_COMPETITION_OR);

  if (matchErr) {
    return {
      ok: false,
      matchesEnriched: 0,
      predictionsUpserted: 0,
      tournamentForecastUpdated: false,
      optaIngested: ingestResult.ingested,
      errors: [...errors, matchErr.message],
    };
  }

  const mapped: WcMatchWithMeta[] = (rawMatches ?? []).map((r) =>
    mapMatchRow(r as Record<string, unknown>, teamNames, teamToGroup)
  );
  let matches = filterWorldCup2026GroupStageMatches(mapped, teamToGroup) as WcMatchWithMeta[];

  const { data: teamsForR32 } = await client.from("teams").select("id, name");
  const r32TeamNames = new Map((teamsForR32 ?? []).map((t) => [t.id, t.name]));
  const { data: r32DbRows } = await client
    .from("matches")
    .select("id, date, home_team_id, away_team_id, home_goals, away_goals, status")
    .like("id", "wc2026-ko-%");
  const r32DbById = new Map((r32DbRows ?? []).map((r) => [r.id as string, r]));

  const r32Rows = buildR32HubMatchRows(r32TeamNames)
    .map((m) => {
      const db = r32DbById.get(m.id);
      if (!db) return m;
      return {
        ...m,
        home_goals: (db.home_goals as number | null) ?? m.home_goals,
        away_goals: (db.away_goals as number | null) ?? m.away_goals,
        status: deriveMatchStatus({
          ...m,
          home_goals: (db.home_goals as number | null) ?? m.home_goals,
          away_goals: (db.away_goals as number | null) ?? m.away_goals,
          status: (db.status as string | null) ?? m.status,
        }),
      };
    })
    .filter(
      (m) =>
        m.home_team_id &&
        m.away_team_id &&
        !isKnockoutSlotPlaceholder(m.home_team_name) &&
        !isKnockoutSlotPlaceholder(m.away_team_name)
    ) as WcMatchWithMeta[];

  const r16Rows = buildR16HubMatchRows(r32TeamNames)
    .map((m) => {
      const db = r32DbById.get(m.id);
      if (!db) return m;
      return {
        ...m,
        home_goals: (db.home_goals as number | null) ?? m.home_goals,
        away_goals: (db.away_goals as number | null) ?? m.away_goals,
        status: deriveMatchStatus({
          ...m,
          home_goals: (db.home_goals as number | null) ?? m.home_goals,
          away_goals: (db.away_goals as number | null) ?? m.away_goals,
          status: (db.status as string | null) ?? m.status,
        }),
      };
    })
    .filter(
      (m) =>
        m.home_team_id &&
        m.away_team_id &&
        !isKnockoutSlotPlaceholder(m.home_team_name) &&
        !isKnockoutSlotPlaceholder(m.away_team_name)
    ) as WcMatchWithMeta[];

  const qfRows = buildQfHubMatchRows(r32TeamNames)
    .map((m) => {
      const db = r32DbById.get(m.id);
      if (!db) return m;
      return {
        ...m,
        home_goals: (db.home_goals as number | null) ?? m.home_goals,
        away_goals: (db.away_goals as number | null) ?? m.away_goals,
        status: deriveMatchStatus({
          ...m,
          home_goals: (db.home_goals as number | null) ?? m.home_goals,
          away_goals: (db.away_goals as number | null) ?? m.away_goals,
          status: (db.status as string | null) ?? m.status,
        }),
      };
    })
    .filter(
      (m) =>
        m.home_team_id &&
        m.away_team_id &&
        !isKnockoutSlotPlaceholder(m.home_team_name) &&
        !isKnockoutSlotPlaceholder(m.away_team_name)
    ) as WcMatchWithMeta[];

  matches = [...matches, ...r32Rows, ...r16Rows, ...qfRows];
  let matchesEnriched = 0;
  for (const m of matches) {
    const patch = enrichMatchEnvironment(m, matches, teamNames, {
      teamToGroup,
      competition: m.competition,
      round: m.round,
    });
    const updatePayload: Record<string, unknown> = {
      status: deriveMatchStatus({
        ...m,
        status: m.status ?? patch.status ?? "scheduled",
      }),
    };
    if (patch.group_code) updatePayload.group_code = patch.group_code;

    const canonical = canonicalizeMatchResultForStandings(
      {
        ...m,
        status: patch.status ?? m.status,
        group_code: patch.group_code ?? m.group_code,
      },
      teamNames
    );
    if (
      canonical &&
      m.home_team_id &&
      m.away_team_id &&
      (canonical.homeTeamId !== m.home_team_id ||
        canonical.awayTeamId !== m.away_team_id ||
        canonical.homeGoals !== m.home_goals ||
        canonical.awayGoals !== m.away_goals)
    ) {
      updatePayload.home_team_id = canonical.homeTeamId;
      updatePayload.away_team_id = canonical.awayTeamId;
      updatePayload.home_goals = canonical.homeGoals;
      updatePayload.away_goals = canonical.awayGoals;
      m.home_team_id = canonical.homeTeamId;
      m.away_team_id = canonical.awayTeamId;
      m.home_goals = canonical.homeGoals;
      m.away_goals = canonical.awayGoals;
    }

    try {
      Object.assign(updatePayload, {
        venue: patch.venue,
        venue_city: patch.venue_city,
        venue_altitude_meters: patch.venue_altitude_meters,
        rest_hours_home: patch.rest_hours_home,
        rest_hours_away: patch.rest_hours_away,
      });
    } catch {
      /* columns may not exist until migration 018 applied */
    }
    const { error } = await wcDb(client).from("matches").update(updatePayload).eq("id", m.id);
    if (!error) {
      matchesEnriched += 1;
      Object.assign(m, patch);
      m.status = patch.status ?? m.status;
      if (patch.group_code) m.group_code = patch.group_code;
    }
  }

  computeAllGroupStandings(matches, teamNames);

  let predictionsUpserted = 0;
  const calibration = await loadWcCalibrationConfig();
  const toPredict = matches.filter((m) => {
    if (m.status !== "scheduled" || !m.home_team_id || !m.away_team_id) return false;
    const phase = resolveMatchPhase({
      status: m.status,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      date: m.date,
      time: m.time,
      venueCity: m.venue_city,
    });
    return shouldRefreshHubPrediction(phase);
  });

  for (let i = 0; i < toPredict.length; i += PREDICT_BATCH_SIZE) {
    const batch = toPredict.slice(i, i + PREDICT_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (match) => {
        try {
          const pred = await runHubMainPredict(match, { finishedMatches: matches });
          const err = await upsertHubPrediction(client, match, pred, calibration);
          return { match, pred, err };
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return { match, pred: null, err: message };
        }
      })
    );

    for (const { match, pred, err } of results) {
      if (err) {
        errors.push(`${match.id} (${match.home_team_name} vs ${match.away_team_name}): ${err}`);
        continue;
      }
      if (pred) predictionsUpserted += 1;
    }
  }

  const { data: predRows } = await wcDb(client).from("world_cup_predictions").select("*");
  const predictionsByMatchId = buildCompletePredictionsMap(matches, predRows ?? []);

  const { data: discRows } = await wcDb(client)
    .from("world_cup_team_discipline")
    .select("team_id, total_fair_play_points");

  const fairPlayByTeam = new Map(
    ((discRows ?? []) as Array<{ team_id: string; total_fair_play_points: number }>).map(
      (d) => [d.team_id, d.total_fair_play_points]
    )
  );

  let tournamentForecastUpdated = false;
  const { payload, errors: forecastErrors } = await runAndPersistTournamentForecast({
    client,
    matches,
    teamNames,
    predictionsByMatchId,
    fairPlayByTeam,
  });
  if (payload) tournamentForecastUpdated = true;
  errors.push(...forecastErrors);

  return {
    ok: errors.length === 0,
    matchesEnriched,
    predictionsUpserted,
    tournamentForecastUpdated,
    optaIngested: ingestResult.ingested,
    errors,
  };
}
