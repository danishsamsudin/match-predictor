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
import { meanPrimaryRatings } from "@/lib/glpm/hub-vector-resolve";
import { remapRatingVectorAcrossCompetitions } from "@/lib/glpm/league-strength";
import {
  buildPromotionPriorVector,
  loadPromotedTeamIds,
  type SeasonCompetitionRef,
} from "@/lib/glpm/promotion";
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

async function loadSeasonCompetition(
  client: Client,
  seasonId: number
): Promise<number | null> {
  const { data } = await client
    .from("glpm_seasons")
    .select("competition_id")
    .eq("sm_id", seasonId)
    .maybeSingle();
  return data?.competition_id ?? null;
}

async function loadSeasonRefs(client: Client): Promise<SeasonCompetitionRef[]> {
  const { data } = await client
    .from("glpm_seasons")
    .select("sm_id,competition_id,start_date")
    .order("start_date", { ascending: false });
  return (data ?? []).map((s) => ({
    smId: s.sm_id,
    competitionId: s.competition_id,
    startDate: s.start_date,
  }));
}

async function loadCompetitionDestinationAnchor(
  client: Client,
  competitionId: number,
  excludeTeamSmId?: number
): Promise<number | null> {
  const { data: seasons } = await client
    .from("glpm_seasons")
    .select("sm_id")
    .eq("competition_id", competitionId);
  const seasonIds = (seasons ?? []).map((s) => s.sm_id);
  if (!seasonIds.length) return null;

  const { data: rows } = await client
    .from("glpm_team_rating_vectors")
    .select(
      "team_sm_id,season_id,as_of_date,r_attack,r_defence,r_goalkeeper,r_build_up,r_possession,r_pressing,r_finishing"
    )
    .in("season_id", seasonIds)
    .order("as_of_date", { ascending: false });

  const latest = new Map<number, NonNullable<typeof rows>[number]>();
  for (const row of rows ?? []) {
    if (excludeTeamSmId != null && row.team_sm_id === excludeTeamSmId) continue;
    if (!latest.has(row.team_sm_id)) latest.set(row.team_sm_id, row);
  }
  if (!latest.size) return null;

  let sum = 0;
  let n = 0;
  for (const row of latest.values()) {
    const ratings = {
      attack: Number(row.r_attack ?? 60),
      defence: Number(row.r_defence ?? 60),
      goalkeeper: Number(row.r_goalkeeper ?? 60),
      build_up: Number(row.r_build_up ?? 60),
      possession: Number(row.r_possession ?? 60),
      pressing: Number(row.r_pressing ?? 60),
      finishing: Number(row.r_finishing ?? 60),
    };
    sum += meanPrimaryRatings(ratings);
    n += 1;
  }
  return n > 0 ? sum / n : null;
}

/**
 * Prefer the requested season vector; otherwise latest any-season vector,
 * remapped when the source competition differs; otherwise a promotion prior
 * for clubs new to the competition.
 */
async function loadVectorForPredict(
  client: Client,
  teamSmId: number,
  seasonId?: number | null,
  cache?: {
    seasons?: SeasonCompetitionRef[];
    promotedBySeason?: Map<number, Set<number>>;
  }
): Promise<LoadedRatingVector | null> {
  if (seasonId != null) {
    const scoped = await loadLatestRatingVector(client, { teamSmId, seasonId });
    if (scoped) return scoped;

    const fallback = await loadLatestRatingVector(client, { teamSmId });
    if (fallback) {
      const [targetCompetitionId, sourceCompetitionId] = await Promise.all([
        loadSeasonCompetition(client, seasonId),
        loadSeasonCompetition(client, fallback.seasonId),
      ]);

      if (
        targetCompetitionId == null ||
        sourceCompetitionId == null ||
        sourceCompetitionId === targetCompetitionId
      ) {
        return fallback;
      }

      const destinationAnchor = await loadCompetitionDestinationAnchor(
        client,
        targetCompetitionId,
        teamSmId
      );

      return remapRatingVectorAcrossCompetitions(
        fallback,
        sourceCompetitionId,
        targetCompetitionId,
        {
          destinationAnchor,
          targetSeasonId: seasonId,
        }
      );
    }

    // No historical vector: use promotion prior when the club is new to this league.
    const seasons = cache?.seasons ?? (await loadSeasonRefs(client));
    if (cache && !cache.seasons) cache.seasons = seasons;
    const competitionId =
      seasons.find((s) => s.smId === seasonId)?.competitionId ??
      (await loadSeasonCompetition(client, seasonId));
    if (competitionId == null) return null;

    let promoted = cache?.promotedBySeason?.get(seasonId);
    if (!promoted) {
      const { data: matches } = await client
        .from("glpm_matches")
        .select("home_team_sm_id,away_team_sm_id")
        .eq("season_id", seasonId);
      const seasonTeams = new Set<number>([teamSmId]);
      for (const m of matches ?? []) {
        seasonTeams.add(m.home_team_sm_id);
        seasonTeams.add(m.away_team_sm_id);
      }
      promoted = await loadPromotedTeamIds(client, {
        seasonId,
        competitionId,
        currentTeamIds: seasonTeams,
        seasons,
      });
      if (cache) {
        if (!cache.promotedBySeason) cache.promotedBySeason = new Map();
        cache.promotedBySeason.set(seasonId, promoted);
      }
    }

    if (promoted.has(teamSmId)) {
      const { data: team } = await client
        .from("glpm_teams")
        .select("name")
        .eq("sm_id", teamSmId)
        .maybeSingle();
      return buildPromotionPriorVector({
        teamSmId,
        seasonId,
        teamName: team?.name ?? null,
      });
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
  const cache: {
    seasons?: SeasonCompetitionRef[];
    promotedBySeason?: Map<number, Set<number>>;
  } = {};

  const home = await loadVectorForPredict(
    client,
    input.homeTeamSmId,
    input.seasonId,
    cache
  );
  const away = await loadVectorForPredict(
    client,
    input.awayTeamSmId,
    input.seasonId,
    cache
  );

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
