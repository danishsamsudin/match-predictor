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
import {
  estimateEventMarkets,
  type CxEventMarketsEstimate,
} from "@/lib/glpm-cx/satellites/event-markets";
import {
  estimatePlayerProps,
  type CxPlayerPropsEstimate,
} from "@/lib/glpm-cx/satellites/player-props";
import {
  EMPTY_SHOT_MARKETS,
  estimateShotMarkets,
  type CxShotMarketsEstimate,
} from "@/lib/glpm-cx/satellites/shot-markets";
import { aggregateVsStyleLift } from "@/lib/glpm-cx/vs-style";
import { resolveStatsSeasonId, TRAIN_FALLBACK_BY_LEAGUE } from "@/lib/glpm/resolve-train-season";
import { resolveVectorSeasonId } from "@/lib/glpm/resolve-vector-season";
import { shortGlpmSeasonLabel } from "@/lib/glpm/hub-prediction-map";

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
    shots: Awaited<ReturnType<typeof estimateShotMarkets>>;
  };
  disclosure: {
    title: string;
    body: string;
  };
  executedAt: string;
  predictionId: string | null;
  priorSeasonCompare: GlpmCxPriorSeasonCompare | null;
  /** Why violet brackets are missing, when the fixture season has no distinct model. */
  seasonCompareNote: string | null;
};

export type GlpmCxPriorSeasonCompare = {
  seasonId: number;
  seasonLabel: string;
  currentSeasonLabel: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  homeXg: number;
  awayXg: number;
  over25: number;
  bttsYes: number;
};

const EMPTY_EVENT_MARKETS: CxEventMarketsEstimate = {
  homeCorners: 0,
  awayCorners: 0,
  totalCorners: 0,
  homeYellows: 0,
  awayYellows: 0,
  totalYellows: 0,
  homeReds: 0,
  awayReds: 0,
  source: "satellite_v1",
  statsSeasonId: null,
  mlActive: false,
};

const EMPTY_PLAYER_PROPS: CxPlayerPropsEstimate = {
  lines: [],
  source: "satellite_v1",
};

function emptyInsight(teamSmId: number, seasonId: number): TeamInsightRatings {
  return {
    teamSmId,
    seasonId,
    asOfDate: null,
    domains: {},
    components: {},
    setPieceThreat: null,
    setPieceDefence: null,
    setPieceSource: "missing",
  };
}

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
    /**
     * Skip insight/satellite loads. Markets still apply rest, travel,
     * weather, altitude, and lineup - used for hub card snapshots.
     */
    lite?: boolean;
  }
): Promise<GlpmCxPredictPayload> {
  const fixtureSeasonId = input.seasonId ?? null;

  let competitionId: number | null = null;
  if (fixtureSeasonId != null) {
    const { data: seasonRow } = await client
      .from("glpm_seasons")
      .select("competition_id")
      .eq("sm_id", fixtureSeasonId)
      .maybeSingle();
    competitionId = seasonRow?.competition_id ?? null;
  }

  // Early-season product rule: main markets stay on the mapped prior season
  // (25/26). Violet brackets show the fixture season (26/27) when trained.
  const priorSeasonId =
    fixtureSeasonId != null && competitionId != null
      ? TRAIN_FALLBACK_BY_LEAGUE[competitionId] ?? null
      : null;
  const mainSeasonId =
    priorSeasonId != null &&
    fixtureSeasonId != null &&
    priorSeasonId !== fixtureSeasonId
      ? priorSeasonId
      : fixtureSeasonId;

  // Frozen GLPM - never pass CX context into runGlpmPredict.
  const baseRaw = await runGlpmPredict(client, {
    homeTeamSmId: input.homeTeamSmId,
    awayTeamSmId: input.awayTeamSmId,
    seasonId: mainSeasonId,
    matchSmId: input.matchSmId,
    persist: false,
    vectorSeasonFallback: false,
  });
  // Keep fixture season id on the payload for match context / persistence.
  const base = {
    ...baseRaw,
    seasonId: fixtureSeasonId ?? baseRaw.seasonId,
  };

  const seasonId = fixtureSeasonId ?? base.seasonId;

  let statsSeasonId = seasonId;
  let statsSeasonIsCurrent = true;
  if (seasonId != null) {
    const statsPick = await resolveStatsSeasonId(
      client,
      seasonId,
      competitionId
    );
    // Insight domains/components follow discriminating vectors: if the stats
    // season collapsed (everyone ~same 0–100), borrow the prior season.
    const vectorPick = await resolveVectorSeasonId(
      client,
      statsPick.seasonId,
      competitionId
    );
    statsSeasonId = vectorPick.seasonId;
    statsSeasonIsCurrent =
      statsPick.mlEligible &&
      !vectorPick.collapsedPreferred &&
      vectorPick.seasonId === seasonId;
  }

  const [context, lineup] = await Promise.all([
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
  ]);

  let homeInsight: TeamInsightRatings;
  let awayInsight: TeamInsightRatings;
  let homeFin: FinishingDifferential | null;
  let awayFin: FinishingDifferential | null;
  let events: CxEventMarketsEstimate;
  let props: CxPlayerPropsEstimate;
  let shots: CxShotMarketsEstimate;
  let homeVs: Array<{ style: string; liftPct: number; n: number }>;
  let awayVs: Array<{ style: string; liftPct: number; n: number }>;

  if (input.lite) {
    homeInsight = emptyInsight(input.homeTeamSmId, statsSeasonId);
    awayInsight = emptyInsight(input.awayTeamSmId, statsSeasonId);
    homeFin = null;
    awayFin = null;
    events = { ...EMPTY_EVENT_MARKETS, statsSeasonId };
    props = EMPTY_PLAYER_PROPS;
    shots = { ...EMPTY_SHOT_MARKETS, statsSeasonId };
    homeVs = [];
    awayVs = [];
  } else {
    const extras = await Promise.all([
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
      estimateShotMarkets(client, {
        homeTeamSmId: input.homeTeamSmId,
        awayTeamSmId: input.awayTeamSmId,
        seasonId: statsSeasonId,
        statsSeasonIsCurrent,
      }),
      aggregateVsStyleLift(client, input.homeTeamSmId, statsSeasonId),
      aggregateVsStyleLift(client, input.awayTeamSmId, statsSeasonId),
    ]);
    homeInsight = extras[0];
    awayInsight = extras[1];
    homeFin = extras[2];
    awayFin = extras[3];
    events = extras[4];
    props = extras[5];
    shots = extras[6];
    homeVs = extras[7];
    awayVs = extras[8];
  }

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

  let priorSeasonCompare: GlpmCxPriorSeasonCompare | null = null;
  let seasonCompareNote: string | null = null;

  // Violet brackets = fixture-season (26/27) markets when that season has its
  // own trained vectors. Main line above already used 25/26.
  if (
    !input.lite &&
    fixtureSeasonId != null &&
    priorSeasonId != null &&
    priorSeasonId !== fixtureSeasonId
  ) {
    const { data: seasonNames } = await client
      .from("glpm_seasons")
      .select("sm_id,name")
      .in("sm_id", [fixtureSeasonId, priorSeasonId]);
    const fixtureName =
      seasonNames?.find((s) => s.sm_id === fixtureSeasonId)?.name ?? null;
    const priorName =
      seasonNames?.find((s) => s.sm_id === priorSeasonId)?.name ?? null;
    const fixtureLabel = shortGlpmSeasonLabel(fixtureName, fixtureSeasonId);
    const priorLabel = shortGlpmSeasonLabel(priorName, priorSeasonId);

    try {
      const fixtureBase = await runGlpmPredict(client, {
        homeTeamSmId: input.homeTeamSmId,
        awayTeamSmId: input.awayTeamSmId,
        seasonId: fixtureSeasonId,
        matchSmId: input.matchSmId,
        persist: false,
        vectorSeasonFallback: false,
      });
      // Only show brackets when ratings actually came from the fixture season.
      if (fixtureBase.vectorSeasonId !== fixtureSeasonId) {
        seasonCompareNote = `Main figures use ${priorLabel} trained ratings. ${fixtureLabel} vectors are not ready yet, so violet brackets are hidden.`;
      } else {
        const fixtureApply = applyCxToXg({
          homeXg: fixtureBase.homeXg,
          awayXg: fixtureBase.awayXg,
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
        const fixtureCx = marketsFromPredict(
          fixtureApply.homeXg,
          fixtureApply.awayXg,
          CX_MODEL_VERSION
        );
        const compare: GlpmCxPriorSeasonCompare = {
          seasonId: fixtureSeasonId,
          seasonLabel: fixtureLabel,
          currentSeasonLabel: priorLabel,
          homeWin: fixtureCx.homeWin,
          draw: fixtureCx.draw,
          awayWin: fixtureCx.awayWin,
          homeXg: fixtureCx.homeXg,
          awayXg: fixtureCx.awayXg,
          over25: fixtureCx.overUnder["2.5"]?.over ?? 0,
          bttsYes: fixtureCx.bttsYes,
        };
        const sameMarkets =
          Math.abs(compare.homeXg - cx.homeXg) < 0.005 &&
          Math.abs(compare.awayXg - cx.awayXg) < 0.005 &&
          Math.abs(compare.homeWin - cx.homeWin) < 0.0005 &&
          Math.abs(compare.awayWin - cx.awayWin) < 0.0005 &&
          Math.abs(compare.bttsYes - cx.bttsYes) < 0.0005 &&
          Math.abs(compare.over25 - (cx.overUnder["2.5"]?.over ?? 0)) < 0.0005;
        if (sameMarkets) {
          seasonCompareNote = `Main figures use ${priorLabel} trained ratings. ${fixtureLabel} currently matches ${priorLabel}, so violet brackets are hidden.`;
          priorSeasonCompare = null;
        } else {
          priorSeasonCompare = compare;
        }
      }
    } catch (err) {
      console.warn("[glpm-cx] fixture-season compare failed", err);
      priorSeasonCompare = null;
      seasonCompareNote = `Main figures use ${priorLabel} trained ratings. ${fixtureLabel} brackets unavailable for this matchup.`;
    }
  }

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
      shots,
    },
    disclosure: {
      title: "GLPM Contextual Extension",
      body: "GLPM-CX builds on frozen GLPM base ratings and xG. Rest, travel, altitude, weather, and lineup multipliers are applied only in this extension, then Dixon–Coles markets are re-derived. GLPM core engines are unchanged.",
    },
    executedAt: new Date().toISOString(),
    predictionId,
    priorSeasonCompare,
    seasonCompareNote,
  };
}
