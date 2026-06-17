import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupMatchPrediction } from "@/lib/world-cup/simulate-group-stage";
import {
  runDeterministicTournamentForecast,
  runMonteCarloTournamentForecast,
} from "@/lib/world-cup/tournament-simulation";
import {
  toTournamentForecastPayload,
  type TournamentForecastPayload,
} from "@/lib/world-cup/tournament-forecast-payload";
import type { WcMatchRow } from "@/lib/world-cup/standings";

const MC_ITERATIONS = 2000;

function wcDb(client: SupabaseClient) {
  return client as unknown as {
    from: (table: string) => {
      upsert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
}

function parseOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Derive a deterministic score line from stored prediction row fields. */
export function rowToGroupMatchPrediction(
  row: Record<string, unknown>
): GroupMatchPrediction | null {
  const snapshot = (row.snapshot as Record<string, unknown>) ?? {};
  const homeXg = parseOptionalNumber(snapshot.home_xg ?? snapshot.lambda);
  const awayXg = parseOptionalNumber(snapshot.away_xg ?? snapshot.mu);

  let home = parseOptionalNumber(row.predicted_score_home);
  let away = parseOptionalNumber(row.predicted_score_away);

  if (home != null && away != null && (home > 0 || away > 0)) {
    return {
      predicted_score_home: home,
      predicted_score_away: away,
      homeXg,
      awayXg,
    };
  }

  const homeWin = parseOptionalNumber(row.home_win_pct);
  const draw = parseOptionalNumber(row.draw_pct);
  const awayWin = parseOptionalNumber(row.away_win_pct);
  if (homeWin != null && draw != null && awayWin != null) {
    if (homeWin >= draw && homeWin >= awayWin) {
      home = 1;
      away = 0;
    } else if (awayWin >= draw && awayWin >= homeWin) {
      home = 0;
      away = 1;
    } else {
      home = 1;
      away = 1;
    }
    return {
      predicted_score_home: home,
      predicted_score_away: away,
      homeXg,
      awayXg,
    };
  }

  if (homeXg != null && awayXg != null) {
    return {
      predicted_score_home: Math.max(0, Math.round(homeXg)),
      predicted_score_away: Math.max(0, Math.round(awayXg)),
      homeXg,
      awayXg,
    };
  }

  return null;
}

export function buildPredictionsMap(
  rows: Array<Record<string, unknown>>
): Map<string, GroupMatchPrediction> {
  const map = new Map<string, GroupMatchPrediction>();
  for (const row of rows) {
    const matchId = row.match_id as string;
    const pred = rowToGroupMatchPrediction(row);
    if (pred) map.set(matchId, pred);
  }
  return map;
}

/** Map predictions for every scheduled group fixture (DB rows + fallbacks). */
export function buildCompletePredictionsMap(
  matches: WcMatchRow[],
  rows: Array<Record<string, unknown>>
): Map<string, GroupMatchPrediction> {
  const map = buildPredictionsMap(rows);
  for (const m of matches) {
    if (m.home_goals != null && m.away_goals != null) continue;
    if (map.has(m.id)) continue;
    map.set(m.id, { predicted_score_home: 1, predicted_score_away: 1 });
  }
  return map;
}

export async function runAndPersistTournamentForecast(input: {
  client: SupabaseClient;
  matches: WcMatchRow[];
  teamNames: Map<string, string>;
  predictionsByMatchId: Map<string, GroupMatchPrediction>;
  fairPlayByTeam: Map<string, number>;
}): Promise<{ payload: TournamentForecastPayload | null; errors: string[] }> {
  const errors: string[] = [];

  const forecast = await runDeterministicTournamentForecast({
    matches: input.matches,
    teamNames: input.teamNames,
    predictionsByMatchId: input.predictionsByMatchId,
    fairPlayByTeam: input.fairPlayByTeam,
    knockoutMode: "hub",
  });

  if (!forecast) {
    errors.push("Deterministic tournament forecast failed");
    return { payload: null, errors };
  }

  if (forecast.warnings.length) {
    errors.push(...forecast.warnings);
  }

  let monteCarlo;
  try {
    monteCarlo = await runMonteCarloTournamentForecast({
      matches: input.matches,
      teamNames: input.teamNames,
      predictionsByMatchId: input.predictionsByMatchId,
      fairPlayByTeam: input.fairPlayByTeam,
      iterations: MC_ITERATIONS,
    });
  } catch (e) {
    errors.push(
      `Monte Carlo forecast failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const payload = toTournamentForecastPayload(forecast, monteCarlo);

  const { error } = await wcDb(input.client).from("world_cup_tournament_projection").upsert({
    id: "latest",
    mode: "deterministic",
    computed_at: payload.computedAt,
    payload,
  });

  if (error) {
    errors.push(`Projection upsert failed: ${error.message}`);
    return { payload: null, errors };
  }

  return { payload, errors };
}
