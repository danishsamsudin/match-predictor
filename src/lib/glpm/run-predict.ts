/**
 * Orchestrate GLPM Rating Vectors → xG → Dixon–Coles for the API / UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import {
  estimateExpectedGoals,
  predictMatch,
  toPredictionHistoryRow,
  type MatchContext,
  type SideInteractions,
} from "@/lib/glpm/engine";
import {
  loadLatestRatingVector,
  loadStyleSnapshot,
  toRatingVectorInput,
  type LoadedRatingVector,
} from "@/lib/glpm/load-vectors";
import type { GlpmPredictUiPayload, GlpmStyleSummary } from "@/lib/glpm/ui-types";

export type { GlpmPredictUiPayload, GlpmStyleSummary } from "@/lib/glpm/ui-types";

type Client = SupabaseClient<Database>;

function styleSummary(
  row: Awaited<ReturnType<typeof loadStyleSnapshot>>
): GlpmStyleSummary | null {
  if (!row) return null;
  const labels = Array.isArray(row.style_labels)
    ? row.style_labels.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    : [];
  return {
    labels: [...new Set(labels)],
    avgPossession:
      row.possession_avg != null ? Number(row.possession_avg) : null,
    avgPpda: row.ppda_avg != null ? Number(row.ppda_avg) : null,
    avgDirectness:
      row.directness_avg != null ? Number(row.directness_avg) : null,
  };
}

function teamBlock(
  loaded: LoadedRatingVector,
  style: GlpmStyleSummary | null
): GlpmPredictUiPayload["homeTeam"] {
  return {
    smId: loaded.teamSmId,
    name: loaded.teamName ?? `Team ${loaded.teamSmId}`,
    ratings: loaded.ratings,
    metadata: loaded.metadata,
    asOfDate: loaded.asOfDate,
    style,
  };
}

/** Use requested season when vectors exist; otherwise latest vector from any trained season. */
async function loadVectorForPredict(
  client: Client,
  teamSmId: number,
  seasonId?: number | null
): Promise<LoadedRatingVector | null> {
  if (seasonId != null) {
    const scoped = await loadLatestRatingVector(client, { teamSmId, seasonId });
    if (scoped) return scoped;

    const { count } = await client
      .from("glpm_team_rating_vectors")
      .select("team_sm_id", { count: "exact", head: true })
      .eq("season_id", seasonId);
    if ((count ?? 0) === 0) {
      return loadLatestRatingVector(client, { teamSmId });
    }
    return null;
  }
  return loadLatestRatingVector(client, { teamSmId });
}

export async function runGlpmPredict(
  client: Client,
  input: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    seasonId?: number | null;
    matchSmId?: number | null;
    context?: MatchContext;
    persist?: boolean;
  }
): Promise<GlpmPredictUiPayload> {
  const home = await loadVectorForPredict(client, input.homeTeamSmId, input.seasonId);
  const away = await loadVectorForPredict(client, input.awayTeamSmId, input.seasonId);

  if (!home) {
    throw new Error(
      `No GLPM rating vector for home team ${input.homeTeamSmId}` +
        (input.seasonId != null ? ` (season ${input.seasonId})` : "")
    );
  }
  if (!away) {
    throw new Error(
      `No GLPM rating vector for away team ${input.awayTeamSmId}` +
        (input.seasonId != null ? ` (season ${input.seasonId})` : "")
    );
  }

  const seasonId = input.seasonId ?? home.seasonId;
  const [homeStyleRow, awayStyleRow] = await Promise.all([
    loadStyleSnapshot(client, {
      teamSmId: input.homeTeamSmId,
      seasonId,
    }),
    loadStyleSnapshot(client, {
      teamSmId: input.awayTeamSmId,
      seasonId,
    }),
  ]);

  const xg = estimateExpectedGoals(
    toRatingVectorInput(home),
    toRatingVectorInput(away),
    input.context ?? { isNeutralVenue: false }
  );
  const pred = predictMatch(xg);

  let predictionId: string | null = null;
  if (input.persist !== false) {
    const row = toPredictionHistoryRow(pred, {
      matchSmId: input.matchSmId,
      homeTeamSmId: input.homeTeamSmId,
      awayTeamSmId: input.awayTeamSmId,
      seasonId,
    });
    const { data, error } = await client
      .from("glpm_prediction_history")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (!error && data?.id) predictionId = data.id;
  }

  const interactions = xg.interactions as {
    home: SideInteractions;
    away: SideInteractions;
  };

  return {
    homeTeam: teamBlock(home, styleSummary(homeStyleRow)),
    awayTeam: teamBlock(away, styleSummary(awayStyleRow)),
    seasonId,
    matchSmId: input.matchSmId ?? null,
    homeXg: pred.homeXg,
    awayXg: pred.awayXg,
    homeWin: pred.homeWin,
    draw: pred.draw,
    awayWin: pred.awayWin,
    bttsYes: pred.bttsYes,
    bttsNo: pred.bttsNo,
    overUnder: pred.overUnder,
    scoreMatrix: pred.scoreMatrix,
    interactions: {
      home: interactions.home,
      away: interactions.away,
    },
    context: xg.context,
    xgModelVersion: xg.modelVersion,
    predModelVersion: pred.modelVersion,
    executedAt: pred.executedAt,
    predictionId,
  };
}
