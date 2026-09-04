/**
 * Orchestrate frozen GLPM base predict + GLPM-CX contextual extension.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { predictMatch } from "@/lib/glpm/engine";
import { runGlpmPredict } from "@/lib/glpm/run-predict";
import type { GlpmPredictUiPayload } from "@/lib/glpm/ui-types";
import {
  loadFinishingDifferential,
  loadTeamInsightRatings,
  type FinishingDifferential,
  type TeamInsightRatings,
} from "@/lib/glpm/load-insight-ratings";
import { applyCxToXg, CX_MODEL_VERSION, type CxApplyResult } from "@/lib/glpm-cx/apply-cx";
import { buildCxContextFeatures, type CxBuiltFeatures } from "@/lib/glpm-cx/context-features";
import {
  computeCxLineupImpact,
  type CxLineupImpact,
} from "@/lib/glpm-cx/lineup-impact";
import {
  deriveMarketsFromScoreMatrix,
  inferStyleLabels,
  styleMatchupBadges,
  type DerivedMarkets,
} from "@/lib/glpm-cx/derived-markets";
import { estimateEventMarkets } from "@/lib/glpm-cx/satellites/event-markets";
import { estimatePlayerProps } from "@/lib/glpm-cx/satellites/player-props";
import { aggregateVsStyleLift } from "@/lib/glpm-cx/vs-style";
import { resolveStatsSeasonId } from "@/lib/glpm/resolve-train-season";

type Client = SupabaseClient<Database>;

export type GlpmCxMarketBlock = {
  homeXg: number;
  awayXg: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  overUnder: Record<string, { over: number; under: number }>;
  scoreMatrix: number[][];
  derived: DerivedMarkets;
  modelVersion: string;
};

export type GlpmCxPredictPayload = {
  base: GlpmPredictUiPayload;
  cx: GlpmCxMarketBlock;
  apply: CxApplyResult;
  context: CxBuiltFeatures;
  lineup: CxLineupImpact;
  insights: {
    home: TeamInsightRatings;
    away: TeamInsightRatings;
    homeFinishingDelta: FinishingDifferential | null;
    awayFinishingDelta: FinishingDifferential | null;
    styleMatchups: Array<{ home: string; away: string; label: string }>;
    homeVsStyle: Array<{ style: string; liftPct: number; n: number }>;
    awayVsStyle: Array<{ style: string; liftPct: number; n: number }>;
  };
  satellites: {
    events: Awaited<ReturnType<typeof estimateEventMarkets>>;
    playerProps: Awaited<ReturnType<typeof estimatePlayerProps>>;
  };
  disclosure: {
    title: string;
    body: string;
  };
  executedAt: string;
  predictionId: string | null;
};

function marketsFromPredict(
  homeXg: number,
  awayXg: number,
  modelVersion: string
): GlpmCxMarketBlock {
  const pred = predictMatch(homeXg, awayXg);
  const derived = deriveMarketsFromScoreMatrix({
    scoreMatrix: pred.scoreMatrix,
    homeWin: pred.homeWin,
    draw: pred.draw,
    awayWin: pred.awayWin,
    bttsYes: pred.bttsYes,
    bttsNo: pred.bttsNo,
    overUnder: pred.overUnder,
  });
  return {
    homeXg: pred.homeXg,
    awayXg: pred.awayXg,
    homeWin: pred.homeWin,
    draw: pred.draw,
    awayWin: pred.awayWin,
    bttsYes: pred.bttsYes,
    bttsNo: pred.bttsNo,
    overUnder: pred.overUnder,
    scoreMatrix: pred.scoreMatrix,
    derived,
    modelVersion,
  };
}

export async function runGlpmCxPredict(
  client: Client,
  input: {
    homeTeamSmId: number;
    awayTeamSmId: number;
    seasonId?: number | null;
    matchSmId?: number | null;
    persist?: boolean;
  }
): Promise<GlpmCxPredictPayload> {
  // Frozen GLPM - never pass CX context into runGlpmPredict.
  const base = await runGlpmPredict(client, {
    homeTeamSmId: input.homeTeamSmId,
    awayTeamSmId: input.awayTeamSmId,
    seasonId: input.seasonId,
    matchSmId: input.matchSmId,
    persist: false,
  });

  const seasonId = input.seasonId ?? base.seasonId;

  let statsSeasonId = seasonId;
  let statsSeasonIsCurrent = true;
  if (seasonId != null) {
    const { data: seasonRow } = await client
      .from("glpm_seasons")
      .select("competition_id")
      .eq("sm_id", seasonId)
      .maybeSingle();
    const statsPick = await resolveStatsSeasonId(
      client,
      seasonId,
      seasonRow?.competition_id ?? null
    );
    statsSeasonId = statsPick.seasonId;
    statsSeasonIsCurrent = statsPick.mlEligible;
  }

  const [context, lineup, homeInsight, awayInsight, homeFin, awayFin, events, props, homeVs, awayVs] =
    await Promise.all([
      buildCxContextFeatures(client, {
        homeTeamSmId: input.homeTeamSmId,
        awayTeamSmId: input.awayTeamSmId,
        matchSmId: input.matchSmId,
        seasonId,
      }),
      computeCxLineupImpact(client, {
        homeTeamSmId: input.homeTeamSmId,
        awayTeamSmId: input.awayTeamSmId,
        seasonId: statsSeasonId,
        matchSmId: input.matchSmId,
      }),
      loadTeamInsightRatings(client, {
        teamSmId: input.homeTeamSmId,
        seasonId: statsSeasonId,
      }),
      loadTeamInsightRatings(client, {
        teamSmId: input.awayTeamSmId,
        seasonId: statsSeasonId,
      }),
      loadFinishingDifferential(client, {
        teamSmId: input.homeTeamSmId,
        seasonId: statsSeasonId,
      }),
      loadFinishingDifferential(client, {
        teamSmId: input.awayTeamSmId,
        seasonId: statsSeasonId,
      }),
      estimateEventMarkets(client, {
        homeTeamSmId: input.homeTeamSmId,
        awayTeamSmId: input.awayTeamSmId,
        seasonId: statsSeasonId,
        statsSeasonIsCurrent,
      }),
      estimatePlayerProps(client, {
        homeTeamSmId: input.homeTeamSmId,
        awayTeamSmId: input.awayTeamSmId,
        seasonId: statsSeasonId,
      }),
      aggregateVsStyleLift(client, input.homeTeamSmId, statsSeasonId),
      aggregateVsStyleLift(client, input.awayTeamSmId, statsSeasonId),
    ]);

  const apply = applyCxToXg({
    homeXg: base.homeXg,
    awayXg: base.awayXg,
    home: {
      restDays: context.home.restDays,
      travelKm: context.home.travelKm,
      restMult: context.home.restMult,
      travelMult: context.home.travelMult,
      altitudeMult: context.home.altitudeMult,
      weatherMult: context.home.weatherMult,
      lineupMult: lineup.homeMult,
    },
    away: {
      restDays: context.away.restDays,
      travelKm: context.away.travelKm,
      restMult: context.away.restMult,
      travelMult: context.away.travelMult,
      altitudeMult: context.away.altitudeMult,
      weatherMult: context.away.weatherMult,
      lineupMult: lineup.awayMult,
    },
  });

  const cx = marketsFromPredict(apply.homeXg, apply.awayXg, CX_MODEL_VERSION);

  // Also attach derived markets onto a copy of base for UI convenience
  const baseDerived = deriveMarketsFromScoreMatrix({
    scoreMatrix: base.scoreMatrix,
    homeWin: base.homeWin,
    draw: base.draw,
    awayWin: base.awayWin,
    bttsYes: base.bttsYes,
    bttsNo: base.bttsNo,
    overUnder: base.overUnder,
  });

  let predictionId: string | null = null;
  if (input.persist !== false) {
    const { data, error } = await client
      .from("glpm_cx_prediction_history")
      .insert({
        match_sm_id: input.matchSmId ?? null,
        home_team_sm_id: input.homeTeamSmId,
        away_team_sm_id: input.awayTeamSmId,
        season_id: seasonId,
        base_home_xg: base.homeXg,
        base_away_xg: base.awayXg,
        home_xg: cx.homeXg,
        away_xg: cx.awayXg,
        home_win_pct: cx.homeWin,
        draw_pct: cx.draw,
        away_win_pct: cx.awayWin,
        btts_yes_pct: cx.bttsYes,
        btts_no_pct: cx.bttsNo,
        over_under: cx.overUnder,
        score_matrix: cx.scoreMatrix,
        breakdown: {
          apply,
          context,
          lineup,
          statsSeasonId,
          eventMlActive: events.mlActive,
        },
        model_version: CX_MODEL_VERSION,
        executed_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (!error && data?.id) predictionId = String(data.id);
  }

  return {
    base: {
      ...base,
      // keep base payload untouched in meaning; derived is only on cx
    },
    cx: {
      ...cx,
      // ensure derived present
      derived: cx.derived ?? baseDerived,
    },
    apply,
    context,
    lineup,
    insights: {
      home: homeInsight,
      away: awayInsight,
      homeFinishingDelta: homeFin,
      awayFinishingDelta: awayFin,
      styleMatchups: styleMatchupBadges(
        inferStyleLabels({
          labels: base.homeTeam.style?.labels ?? [],
          ratings: base.homeTeam.ratings,
          avgPossession: base.homeTeam.style?.avgPossession ?? null,
          avgPpda: base.homeTeam.style?.avgPpda ?? null,
        }),
        inferStyleLabels({
          labels: base.awayTeam.style?.labels ?? [],
          ratings: base.awayTeam.ratings,
          avgPossession: base.awayTeam.style?.avgPossession ?? null,
          avgPpda: base.awayTeam.style?.avgPpda ?? null,
        })
      ),
      homeVsStyle: homeVs,
      awayVsStyle: awayVs,
    },
    satellites: {
      events,
      playerProps: props,
    },
    disclosure: {
      title: "GLPM Contextual Extension",
      body: "GLPM-CX builds on frozen GLPM base ratings and xG. Rest, travel, altitude, weather, and lineup multipliers are applied only in this extension, then Dixon–Coles markets are re-derived. GLPM core engines are unchanged.",
    },
    executedAt: new Date().toISOString(),
    predictionId,
  };
}
