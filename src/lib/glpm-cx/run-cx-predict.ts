/**
 * Orchestrate frozen GLPM base predict + GLPM-CX contextual extension.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { predictMatch } from "@/lib/glpm/engine";
import type { PredictionConfig } from "@/lib/glpm/engine/predictions";
import { runGlpmPredict } from "@/lib/glpm/run-predict";
import type { GlpmPredictUiPayload } from "@/lib/glpm/ui-types";
import {
  loadScoreGridCalibration,
  predictionConfigFromCalibration,
} from "@/lib/glpm/score-grid-calibration";
import {
  loadFinishingDifferential,
  loadTeamInsightRatings,
  type FinishingDifferential,
  type TeamInsightRatings,
} from "@/lib/glpm/load-insight-ratings";
import { applyCxToXg, CX_MODEL_VERSION, type CxApplyResult } from "@/lib/glpm-cx/apply-cx";
import {
  applyFormToXg,
  FORM_CAP,
  FORM_LOOKBACK,
  loadFormFactors,
  type FormFactorResult,
} from "@/lib/glpm-cx/form-factor";
import { buildCxContextFeatures, type CxBuiltFeatures } from "@/lib/glpm-cx/context-features";
import {
  applySharpShrink,
  calibrateBinaryProb,
  calibrateBttsYes,
  calibrateOverProb,
  resolveGlpmMarketModels,
  resolveGlpmSharpShrink,
  resolveKeyedStack,
  temper1x2Probs,
} from "@/lib/glpm/market-models";
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
  estimateShotMarkets,
  type CxShotMarketsEstimate,
} from "@/lib/glpm-cx/satellites/shot-markets";
import { aggregateVsStyleLift } from "@/lib/glpm-cx/vs-style";
import { resolveStatsSeasonId } from "@/lib/glpm/resolve-train-season";
import { resolveVectorSeasonId } from "@/lib/glpm/resolve-vector-season";
import {
  GLPM_1X2_TEMPERATURE_DEFAULT,
  loadGlpmCalibrationConfig,
} from "@/lib/glpm/glpm-calibration-config";
import type { ConfidenceLayerConfig } from "@/lib/value-opportunities/confidence-layer";

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

/** Recency form adjustment applied after the five context multipliers. */
export type GlpmCxFormAdjustment = FormFactorResult & {
  applied: boolean;
  lookback: number;
  cap: number;
};

export type GlpmCxPredictPayload = {
  base: GlpmPredictUiPayload;
  cx: GlpmCxMarketBlock;
  apply: CxApplyResult;
  /** Form multipliers baked into `cx` λ (1.000 when skipped / insufficient sample). */
  form: GlpmCxFormAdjustment;
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
  /** Retired dual-season compare; always null. */
  priorSeasonCompare: GlpmCxPriorSeasonCompare | null;
  /** Retired dual-season note; always null. */
  seasonCompareNote: string | null;
  /** Per-league Value Opportunities confidence layer (null when not yet calibrated). */
  confidenceLayer: ConfidenceLayerConfig | null;
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
  modelVersion: string,
  predConfig?: Partial<PredictionConfig>
): GlpmCxMarketBlock {
  const pred = predictMatch(homeXg, awayXg, predConfig);
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

  const calibration = loadScoreGridCalibration(competitionId);
  const predConfig = {
    ...predictionConfigFromCalibration(calibration),
    // Extra scoreline resolution for AH/EH tails (±1.5 / ±2+).
    maxGoals: 12,
  };

  // Product rule: markets use the fixture season (26/27). Prior-season (25/26)
  // vectors stay in the DB for training / fallbacks but are not shown.
  const mainSeasonId = fixtureSeasonId;

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
    homeVs = [];
    awayVs = [];
    // Still lock shot/SoT markets for Value Opportunities confidence learning.
    shots = await estimateShotMarkets(client, {
      homeTeamSmId: input.homeTeamSmId,
      awayTeamSmId: input.awayTeamSmId,
      seasonId: statsSeasonId,
      statsSeasonIsCurrent,
    });
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

  let formHomeXg = apply.homeXg;
  let formAwayXg = apply.awayXg;
  let form: GlpmCxFormAdjustment = {
    applied: false,
    homeMult: 1,
    awayMult: 1,
    homeRecentXgFor: null,
    homeRecentXgAgainst: null,
    awayRecentXgFor: null,
    awayRecentXgAgainst: null,
    nHome: 0,
    nAway: 0,
    lookback: FORM_LOOKBACK,
    cap: FORM_CAP,
  };
  try {
    const loaded = await loadFormFactors({
      client,
      homeTeamSmId: input.homeTeamSmId,
      awayTeamSmId: input.awayTeamSmId,
      beforeKickoffIso: null,
    });
    const applied = loaded.nHome >= 3 && loaded.nAway >= 3;
    form = {
      ...loaded,
      applied,
      homeMult: applied ? loaded.homeMult : 1,
      awayMult: applied ? loaded.awayMult : 1,
      lookback: FORM_LOOKBACK,
      cap: FORM_CAP,
    };
    if (applied) {
      const formed = applyFormToXg(apply.homeXg, apply.awayXg, loaded);
      formHomeXg = formed.homeXg;
      formAwayXg = formed.awayXg;
    }
  } catch {
    // Non-fatal: keep CX λ without form.
  }

  const cxRaw = marketsFromPredict(
    formHomeXg,
    formAwayXg,
    CX_MODEL_VERSION,
    predConfig
  );

  const leagueCalibration =
    competitionId != null
      ? await loadGlpmCalibrationConfig(competitionId, client)
      : null;
  const marketModels = resolveGlpmMarketModels(leagueCalibration);
  const sharpShrink = resolveGlpmSharpShrink(leagueCalibration);

  const calibratedBttsYes = calibrateBttsYes({
    rawYes: cxRaw.bttsYes,
    homeXg: formHomeXg,
    awayXg: formAwayXg,
    coeffs: marketModels.btts,
  });
  const calibratedOverUnder: Record<string, { over: number; under: number }> = {};
  for (const [line, ou] of Object.entries(cxRaw.overUnder)) {
    const coeffs = marketModels.overUnder[line];
    let over = calibrateOverProb({ rawOver: ou.over, coeffs });
    over = applySharpShrink(
      over,
      null,
      sharpShrink.alphaByMarket[`ou-${line}`] ?? sharpShrink.alphaByMarket.ou ?? 0
    );
    calibratedOverUnder[line] = { over, under: Math.max(0, 1 - over) };
  }
  const bttsYesFinal = applySharpShrink(
    calibratedBttsYes,
    null,
    sharpShrink.alphaByMarket.btts ?? 0
  );

  const oneXTwoTemperature =
    leagueCalibration?.oneXTwoTemperature ?? GLPM_1X2_TEMPERATURE_DEFAULT;
  const tempered1x2 = temper1x2Probs(
    cxRaw.homeWin,
    cxRaw.draw,
    cxRaw.awayWin,
    oneXTwoTemperature
  );
  const ahAlpha =
    sharpShrink.alphaByMarket.ah ??
    sharpShrink.alphaByMarket.asian_handicap ??
    0;
  const ehAlpha =
    sharpShrink.alphaByMarket.eh ??
    sharpShrink.alphaByMarket.european_handicap ??
    0;
  const dcAlpha =
    sharpShrink.alphaByMarket.dc ??
    sharpShrink.alphaByMarket.double_chance ??
    0;

  const derivedRaw = deriveMarketsFromScoreMatrix({
    scoreMatrix: cxRaw.scoreMatrix,
    homeWin: tempered1x2.homeWin,
    draw: tempered1x2.draw,
    awayWin: tempered1x2.awayWin,
    bttsYes: bttsYesFinal,
    bttsNo: Math.max(0, 1 - bttsYesFinal),
    overUnder: calibratedOverUnder,
  });

  const calibratedAh = derivedRaw.asianHandicap.map((row) => {
    const homeKey = `home_${row.line}`;
    const awayKey = `away_${row.line}`;
    let homeCover = calibrateBinaryProb(
      row.homeCover,
      resolveKeyedStack(marketModels.asianHandicap, homeKey) ??
        resolveKeyedStack(marketModels.asianHandicap, String(row.line))
    );
    let awayCover = calibrateBinaryProb(
      row.awayCover,
      resolveKeyedStack(marketModels.asianHandicap, awayKey) ??
        resolveKeyedStack(marketModels.asianHandicap, String(row.line))
    );
    homeCover = applySharpShrink(homeCover, null, ahAlpha);
    awayCover = applySharpShrink(awayCover, null, ahAlpha);
    const sum = homeCover + awayCover || 1;
    return {
      ...row,
      homeCover: homeCover / sum,
      awayCover: awayCover / sum,
    };
  });

  const calibratedEh = derivedRaw.europeanHandicap.map((row) => {
    const tag = row.line > 0 ? `+${row.line}` : String(row.line);
    let home = calibrateBinaryProb(
      row.home,
      resolveKeyedStack(marketModels.europeanHandicap, `${tag}_home`)
    );
    let draw = calibrateBinaryProb(
      row.draw,
      resolveKeyedStack(marketModels.europeanHandicap, `${tag}_draw`)
    );
    let away = calibrateBinaryProb(
      row.away,
      resolveKeyedStack(marketModels.europeanHandicap, `${tag}_away`)
    );
    home = applySharpShrink(home, null, ehAlpha);
    draw = applySharpShrink(draw, null, ehAlpha);
    away = applySharpShrink(away, null, ehAlpha);
    const sum = home + draw + away || 1;
    return {
      ...row,
      home: home / sum,
      draw: draw / sum,
      away: away / sum,
    };
  });

  let dc1x = calibrateBinaryProb(
    derivedRaw.doubleChance.homeOrDraw,
    resolveKeyedStack(marketModels.doubleChance, "1x")
  );
  let dc12 = calibrateBinaryProb(
    derivedRaw.doubleChance.homeOrAway,
    resolveKeyedStack(marketModels.doubleChance, "12")
  );
  let dcX2 = calibrateBinaryProb(
    derivedRaw.doubleChance.drawOrAway,
    resolveKeyedStack(marketModels.doubleChance, "x2")
  );
  dc1x = applySharpShrink(dc1x, null, dcAlpha);
  dc12 = applySharpShrink(dc12, null, dcAlpha);
  dcX2 = applySharpShrink(dcX2, null, dcAlpha);

  const derived: DerivedMarkets = {
    ...derivedRaw,
    asianHandicap: calibratedAh,
    europeanHandicap: calibratedEh,
    doubleChance: {
      homeOrDraw: dc1x,
      homeOrAway: dc12,
      drawOrAway: dcX2,
    },
  };

  const cx: GlpmCxMarketBlock = {
    ...cxRaw,
    homeXg: formHomeXg,
    awayXg: formAwayXg,
    homeWin: tempered1x2.homeWin,
    draw: tempered1x2.draw,
    awayWin: tempered1x2.awayWin,
    bttsYes: bttsYesFinal,
    bttsNo: Math.max(0, 1 - bttsYesFinal),
    overUnder: calibratedOverUnder,
    derived,
  };

  // Prior-season compare UI retired: keep null fields for payload compatibility.
  const priorSeasonCompare: GlpmCxPriorSeasonCompare | null = null;
  const seasonCompareNote: string | null = null;

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
          form,
          context,
          lineup,
          statsSeasonId,
          eventMlActive: events.mlActive,
          /** Locked shot/SoT market probs for post-match confidence learning. */
          shotMarkets: {
            homeShots: shots.homeShots,
            awayShots: shots.awayShots,
            totalShots: shots.totalShots,
            homeSot: shots.homeSot,
            awaySot: shots.awaySot,
            totalSot: shots.totalSot,
            shotsOverUnder: shots.shotsOverUnder,
            sotOver: shots.sotOver,
            source: shots.source,
            mlActive: shots.mlActive,
          },
        },
        model_version: CX_MODEL_VERSION,
        executed_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (!error && data?.id) predictionId = String(data.id);
  }

  let confidenceLayer: ConfidenceLayerConfig | null = null;
  // Prefer the early competitionId; if the caller omitted seasonId, fall back to
  // the effective season used for the prediction so VO confidence still attaches.
  let layerLeagueId = competitionId;
  if (layerLeagueId == null && seasonId != null) {
    const { data: seasonRow } = await client
      .from("glpm_seasons")
      .select("competition_id")
      .eq("sm_id", seasonId)
      .maybeSingle();
    layerLeagueId = seasonRow?.competition_id ?? null;
  }
  if (layerLeagueId != null) {
    try {
      const calib = await loadGlpmCalibrationConfig(layerLeagueId, client);
      const markets = calib.confidenceLayer?.markets ?? {};
      confidenceLayer =
        Object.keys(markets).length > 0 ? calib.confidenceLayer : null;
    } catch (err) {
      console.warn("[glpm-cx] confidence layer load failed", err);
      confidenceLayer = null;
    }
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
    form,
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
      body: "GLPM-CX builds on frozen GLPM base ratings and xG. Rest, travel, altitude, weather, lineup, and capped recency form multipliers are applied only in this extension, then Dixon-Coles markets are re-derived. GLPM core engines are unchanged.",
    },
    executedAt: new Date().toISOString(),
    predictionId,
    priorSeasonCompare,
    seasonCompareNote,
    confidenceLayer,
  };
}
