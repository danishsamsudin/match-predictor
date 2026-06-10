import {
  computeFormScore,
  computeH2HRates,
  fetchFootballBundle,
  parseTeamStats,
} from "@/lib/api/football";
import { getWeatherForecast } from "@/lib/api/weather";
import { applyCustomLineupsToTeamComparison } from "@/lib/data/apply-custom-lineups-to-comparison";
import { buildTeamComparisonSnapshot } from "@/lib/data/build-team-comparison";
import {
  formatMuSourceLabel,
  resolveCompetitionAvgGoals,
} from "@/lib/data/resolve-competition-avg-goals";
import { getTeamCity, resolveDomesticLeagueId } from "@/lib/data/football-reference";
import { getCanonicalTeamHomeVenue } from "@/lib/data/team-home-venues";
import { ensureFifaRankingsLoaded } from "@/lib/data/fifa-rankings-store";
import {
  formatStrengthExplanationLine,
  getTeamStrengthMultiplier,
  normalizeFormScoreToBenchmark,
  normalizeTeamStatsToBenchmark,
} from "@/lib/prediction/team-strength";
import { computeBaseProbability, computeMomentumIndex } from "@/lib/prediction/base-probability";
import { getMomentumWeights, clampMomentumIndex } from "@/lib/prediction/form-momentum";
import {
  resolveLeagueStrengthForTeam,
  resolveTeamStatsForFixture,
} from "@/lib/prediction/continental-cup";
import {
  computeFirstTeamToScoreFromMatrix,
  computeMarketAnalytics,
  computeOutcomeProbabilities,
  parseSeasonStat,
  resolveScoreMatrixCorrelation,
  resolveScoreMatrixMaxGoals,
} from "@/lib/prediction/market-probabilities";
import { computeLineupPlayerXgImpact } from "@/lib/prediction/lineup-player-xg-impact";
import { resolveLineupPlayerStats } from "@/lib/prediction/resolve-lineup-player-stats";
import { neutralLineupImpact } from "@/lib/prediction/validate-custom-lineups";
import {
  isFifaWorldCupLeagueId,
  isHighStakesCupFinal,
  isNeutralVenue,
} from "@/lib/prediction/neutral-venue";
import {
  computeStadiumImpact,
  INTERNATIONAL_HOST_CITY_CAP,
} from "@/lib/prediction/stadium-impact";
import {
  buildInternationalBaselineXg,
  pullInternationalXgTowardFifaAnchor,
  resolveFifaRatingDelta,
} from "@/lib/world-cup/international-strength";
import { computeEstimatedMatchStats } from "@/lib/prediction/estimated-match-stats";
import { computeWeatherImpact } from "@/lib/prediction/weather-impact";
import { tryCreateServiceClient } from "@/lib/supabase";
import { resolveCityCoordinates } from "@/lib/utils/geo";
import { resolveTeamShortLabelsForMatch } from "@/lib/utils/team-display-name";
import type {
  LineupImpactResult,
  PredictRequest,
  PredictionResult,
  TeamStatAverages,
} from "@/lib/types/prediction";

/** Minimum xG floor before Poisson grid evaluation. */
const XG_FLOOR = 0.3;
const MODEL_VERSION = "v2.1";
function normalizeTo100(
  home: number,
  draw: number,
  away: number
): { homeWinPct: number; drawPct: number; awayWinPct: number } {
  const homeWinPct = Math.round(home * 1000) / 10;
  const drawPct = Math.round(draw * 1000) / 10;
  let awayWinPct = Math.round(away * 1000) / 10;
  const sum = homeWinPct + drawPct + awayWinPct;
  if (sum !== 100) {
    awayWinPct = Math.round((100 - homeWinPct - drawPct) * 10) / 10;
  }
  return { homeWinPct, drawPct, awayWinPct };
}

/** xG deflation for cautious high-stakes neutral cup ties. */
const HIGH_STAKES_XG_CAUTION = 0.92;

export async function runPrediction(input: PredictRequest): Promise<PredictionResult> {
  await ensureFifaRankingsLoaded();
  const { homeTeamId, awayTeamId, city, matchDate } = input;

  const [bundle, weather] = await Promise.all([
    fetchFootballBundle(input),
    getWeatherForecast(city, matchDate),
  ]);

  const fixtureLeagueId = bundle.fixture.league.id;
  const neutralVenue = isNeutralVenue(input.mode, bundle, city);
  const highStakesCup = isHighStakesCupFinal(bundle, neutralVenue);
  const internationalFixture =
    input.entityType === "national" || isFifaWorldCupLeagueId(fixtureLeagueId);
  const season = bundle.fixture.league.season;

  const homeDomesticLeagueId =
    input.homeLeagueId ?? resolveDomesticLeagueId(homeTeamId);
  const awayDomesticLeagueId =
    input.awayLeagueId ?? resolveDomesticLeagueId(awayTeamId);

  const [homeStats, awayStats] = await Promise.all([
    resolveTeamStatsForFixture({
      teamId: homeTeamId,
      stats: bundle.homeStats,
      leagueId: fixtureLeagueId,
      season,
      isHomeSide: true,
      isNeutralVenue: neutralVenue,
      domesticLeagueId: homeDomesticLeagueId,
    }),
    resolveTeamStatsForFixture({
      teamId: awayTeamId,
      stats: bundle.awayStats,
      leagueId: fixtureLeagueId,
      season,
      isHomeSide: false,
      isNeutralVenue: neutralVenue,
      domesticLeagueId: awayDomesticLeagueId,
    }),
  ]);

  const homeLeagueIdForStrength = resolveLeagueStrengthForTeam({
    fixtureLeagueId,
    domesticLeagueId: homeDomesticLeagueId,
    explicitLeagueId: input.homeLeagueId,
  });
  const awayLeagueIdForStrength = resolveLeagueStrengthForTeam({
    fixtureLeagueId,
    domesticLeagueId: awayDomesticLeagueId,
    explicitLeagueId: input.awayLeagueId,
  });

  const strengthCtx = {
    entityType: input.entityType,
    leagueId: fixtureLeagueId,
    homeTeamId,
    awayTeamId,
  };

  const homeStrengthCtx = {
    entityType: input.entityType,
    teamId: homeTeamId,
    teamName: input.homeTeamName,
    leagueId: homeLeagueIdForStrength,
  };
  const awayStrengthCtx = {
    entityType: input.entityType,
    teamId: awayTeamId,
    teamName: input.awayTeamName,
    leagueId: awayLeagueIdForStrength,
  };

  const homeLeagueStrength = getTeamStrengthMultiplier(homeStrengthCtx);
  const awayLeagueStrength = getTeamStrengthMultiplier(awayStrengthCtx);

  const homeFormScore = normalizeFormScoreToBenchmark(
    computeFormScore(bundle.homeForm, homeTeamId),
    homeStrengthCtx
  );
  const awayFormScore = normalizeFormScoreToBenchmark(
    computeFormScore(bundle.awayForm, awayTeamId),
    awayStrengthCtx
  );
  const h2h = computeH2HRates(bundle.h2h, homeTeamId, {
    entityType: input.entityType,
    referenceDate: matchDate,
    leagueId: fixtureLeagueId,
  });

  const muResult = await resolveCompetitionAvgGoals({
    leagueId: fixtureLeagueId,
    entityType: input.entityType,
    seasonId: season,
  });

  const homeStatsBenchmark = normalizeTeamStatsToBenchmark(homeStats, homeStrengthCtx);
  const awayStatsBenchmark = normalizeTeamStatsToBenchmark(awayStats, awayStrengthCtx);

  const baseInput = {
    homeFormScore,
    awayFormScore,
    h2hHomeWinRate: h2h.homeWinRate,
    h2hDrawRate: h2h.drawRate,
    h2hAwayWinRate: h2h.awayWinRate,
    homeLeagueStrength,
    awayLeagueStrength,
    homeStats: homeStatsBenchmark,
    awayStats: awayStatsBenchmark,
    isNeutralVenue: neutralVenue,
    leagueAvgGoals: muResult.mu,
  };

  const momentumIndex = computeMomentumIndex({
    ...baseInput,
    h2hHasData: h2h.hasData,
    h2hMeetingCount: bundle.h2h.length,
    h2hMaxMeetingAgeMonths: h2h.maxMeetingAgeMonths,
    homeLeagueStrength,
    awayLeagueStrength,
    homeLeagueId: homeLeagueIdForStrength,
    awayLeagueId: awayLeagueIdForStrength,
    entityType: input.entityType,
    homeTeamId,
    awayTeamId,
    homeTeamName: input.homeTeamName,
    awayTeamName: input.awayTeamName,
    homeStats: homeStatsBenchmark,
    awayStats: awayStatsBenchmark,
  });

  const internationalMomentum = clampMomentumIndex(momentumIndex * 0.55);

  const fifaRatingDelta = internationalFixture
    ? resolveFifaRatingDelta(
        homeTeamId,
        awayTeamId,
        input.homeTeamName,
        input.awayTeamName
      )
    : undefined;

  let base = internationalFixture
    ? buildInternationalBaselineXg({
        mu: muResult.mu,
        homeTeamId,
        awayTeamId,
        homeName: input.homeTeamName,
        awayName: input.awayTeamName,
        homeStats,
        awayStats,
        momentumIndex: internationalMomentum,
      })
    : computeBaseProbability(baseInput);

  const lineupSource = input.lineupSource ?? "manual_xi";
  const supabase = tryCreateServiceClient();

  let lineup: LineupImpactResult;

  if (lineupSource === "manual_xi" && input.customLineups?.length) {
    const playerStats = await resolveLineupPlayerStats({
      lineups: input.customLineups,
      homeTeamId,
      awayTeamId,
      homeTeamName: input.homeTeamName,
      awayTeamName: input.awayTeamName,
      homeLeagueId: input.homeLeagueId,
      awayLeagueId: input.awayLeagueId,
      entityType: input.entityType,
      supabase,
    });

    lineup = computeLineupPlayerXgImpact({
      homePlayers: playerStats.home,
      awayPlayers: playerStats.away,
      baseHomeXg: base.homeXg,
      baseAwayXg: base.awayXg,
      mu: muResult.mu,
    });
  } else {
    lineup = neutralLineupImpact(
      "Model squad mode — team structural xG only (no manual XI adjustment)."
    );
  }

  const weatherImpact = computeWeatherImpact(
    weather,
    homeStatsBenchmark,
    awayStatsBenchmark
  );

  const matchLocation =
    weather.lat != null && weather.lon != null
      ? { lat: weather.lat, lon: weather.lon }
      : resolveCityCoordinates(city) ??
        resolveCityCoordinates(bundle.fixture.fixture.venue.city) ?? {
          lat: 51.5,
          lon: -0.12,
        };

  const homeTeamCity =
    getTeamCity(homeTeamId, {
      entityType: input.entityType,
      teamName: input.homeTeamName ?? bundle.homeTeamInfo.team.name,
    }) || bundle.homeTeamInfo.venue.city;
  const awayTeamCity =
    getTeamCity(awayTeamId, {
      entityType: input.entityType,
      teamName: input.awayTeamName ?? bundle.awayTeamInfo.team.name,
    }) || bundle.awayTeamInfo.venue.city;

  const homeVenueName =
    getCanonicalTeamHomeVenue(homeTeamId, bundle.homeTeamInfo.team.name)?.name ??
    bundle.homeTeamInfo.venue.name ??
    bundle.fixture.fixture.venue.name;

  const stadium = computeStadiumImpact(
    homeVenueName,
    matchLocation,
    {
      city: homeTeamCity,
      homeLocation:
        resolveCityCoordinates(homeTeamCity) ??
        resolveCityCoordinates(bundle.homeTeamInfo.venue.city),
    },
    {
      city: awayTeamCity,
      homeLocation:
        resolveCityCoordinates(awayTeamCity) ??
        resolveCityCoordinates(bundle.awayTeamInfo.venue.city),
    },
    {
      isNeutralVenue: neutralVenue,
      matchCity: city,
      hostCityMultiplierCap: internationalFixture ? INTERNATIONAL_HOST_CITY_CAP : undefined,
      internationalTournament: internationalFixture,
    }
  );

  let homeXg = base.homeXg;
  let awayXg = base.awayXg;

  homeXg *=
    lineup.homeXgMultiplier *
    weatherImpact.homeXgMultiplier *
    stadium.homeXgMultiplier;
  awayXg *=
    lineup.awayXgMultiplier *
    weatherImpact.awayXgMultiplier *
    stadium.awayXgMultiplier;
  awayXg *= lineup.homeDefenseMultiplier ?? 1;
  homeXg *= lineup.awayDefenseMultiplier ?? 1;

  const skipHighStakesCaution =
    internationalFixture &&
    fifaRatingDelta != null &&
    Math.abs(fifaRatingDelta) > 120;

  if (highStakesCup && !skipHighStakesCaution) {
    homeXg *= HIGH_STAKES_XG_CAUTION;
    awayXg *= HIGH_STAKES_XG_CAUTION;
  }

  if (internationalFixture) {
    const pulled = pullInternationalXgTowardFifaAnchor(homeXg, awayXg, {
      homeTeamId,
      awayTeamId,
      homeName: input.homeTeamName,
      awayName: input.awayTeamName,
      mu: muResult.mu,
    });
    homeXg = pulled.homeXg;
    awayXg = pulled.awayXg;
  }

  homeXg = Math.max(XG_FLOOR, homeXg);
  awayXg = Math.max(XG_FLOOR, awayXg);

  homeXg = Math.round(homeXg * 100) / 100;
  awayXg = Math.round(awayXg * 100) / 100;

  const estimatedMatchStats = computeEstimatedMatchStats({
    homeStats,
    awayStats,
    homeXg,
    awayXg,
    foulsMultiplier: weatherImpact.foulsMultiplier * stadium.foulsMultiplier,
    cardsMultiplier: weatherImpact.cardsMultiplier * stadium.cardsMultiplier,
    fifaRatingDelta,
  });

  const scoreMatrixMaxGoals = resolveScoreMatrixMaxGoals(homeXg, awayXg);
  const scoreCorrelation = resolveScoreMatrixCorrelation(homeXg, awayXg, highStakesCup, {
    international: internationalFixture,
    fifaRatingDelta,
  });
  const probs = computeOutcomeProbabilities(homeXg, awayXg, scoreMatrixMaxGoals, {
    correlation: scoreCorrelation,
  });
  const { homeWinPct, drawPct, awayWinPct } = normalizeTo100(
    probs.homeWin,
    probs.draw,
    probs.awayWin
  );

  const firstTeamToScorePct = computeFirstTeamToScoreFromMatrix(
    homeXg,
    awayXg,
    scoreMatrixMaxGoals,
    { correlation: scoreCorrelation }
  );

  const homeTeamName =
    input.homeTeamName?.trim() ||
    bundle.fixture.teams.home.name ||
    bundle.homeTeamInfo.team.name;
  const awayTeamName =
    input.awayTeamName?.trim() ||
    bundle.fixture.teams.away.name ||
    bundle.awayTeamInfo.team.name;

  const { home: homeTeamShortName, away: awayTeamShortName } =
    await resolveTeamShortLabelsForMatch({
      homeTeamId,
      awayTeamId,
      homeTeamName,
      awayTeamName,
      homeTeamShortName: input.homeTeamShortName,
      awayTeamShortName: input.awayTeamShortName,
    });

  const explanationParts = [
    "## Weather Impact",
    ...weatherImpact.notes,
    "",
    "## Stadium & Travel",
    ...stadium.notes,
    "",
    "## Lineup Impact",
    ...lineup.notes,
    "",
    `## Base Analysis`,
    neutralVenue
      ? `Neutral venue - team stats use overall averages; home/away momentum tilt suppressed.`
      : `Home/away split stats and momentum coefficients active.`,
    highStakesCup
      ? `High-stakes cup tie - xG deflated ${((1 - HIGH_STAKES_XG_CAUTION) * 100).toFixed(0)}% and Dixon-Coles draw correlation ρ=${scoreCorrelation.toFixed(2)} applied.`
      : null,
    formatStrengthExplanationLine(
      homeTeamName,
      awayTeamName,
      homeLeagueStrength,
      awayLeagueStrength,
      strengthCtx
    ),
    (() => {
      const { w1, w2 } = getMomentumWeights(input.entityType, homeLeagueIdForStrength);
      const pctForm = Math.round(w1 * 100);
      const pctH2h = Math.round(w2 * 100);
      return `Momentum index: ${momentumIndex.toFixed(3)} (form ${pctForm}% + H2H ${pctH2h}%, log-linear model ${MODEL_VERSION}).`;
    })(),
    `Competition μ=${muResult.mu.toFixed(2)} (${formatMuSourceLabel(muResult.source, muResult.competitionClass)}).`,
    `${homeTeamName} form score: ${(homeFormScore * 100).toFixed(0)}% | ${awayTeamName} form score: ${(awayFormScore * 100).toFixed(0)}%.`,
    h2h.hasData
      ? `H2H rates - ${homeTeamName} win: ${(h2h.homeWinRate * 100).toFixed(0)}%, Draw: ${(h2h.drawRate * 100).toFixed(0)}%, ${awayTeamName} win: ${(h2h.awayWinRate * 100).toFixed(0)}%.`
      : `H2H rates - insufficient history; momentum uses form only.`,
    `Structural baseline xG (pre-shock): ${homeTeamName} ${base.homeXg.toFixed(2)} - ${awayTeamName} ${base.awayXg.toFixed(2)}.`,
    `Final xG after all adjustments: ${homeTeamName} ${homeXg} - ${awayTeamName} ${awayXg}.`,
  ].filter((line): line is string => line != null);

  let teamComparison = await buildTeamComparisonSnapshot(input, bundle);
  if (
    lineupSource === "manual_xi" &&
    input.customLineups?.length &&
    teamComparison
  ) {
    teamComparison = applyCustomLineupsToTeamComparison(
      teamComparison,
      input.customLineups
    );
  }

  const statComparison: { metric: string; home: number; away: number }[] = [];
  if (teamComparison) {
    const pairs: Array<{
      metric: string;
      home: string | null;
      away: string | null;
    }> = [
      {
        metric: "Goals scored / game",
        home: teamComparison.home.seasonStats.goalsForPerGame,
        away: teamComparison.away.seasonStats.goalsForPerGame,
      },
      {
        metric: "Goals conceded / game",
        home: teamComparison.home.seasonStats.goalsAgainstPerGame,
        away: teamComparison.away.seasonStats.goalsAgainstPerGame,
      },
      {
        metric: "Corners / game",
        home: teamComparison.home.seasonStats.cornersPerGame,
        away: teamComparison.away.seasonStats.cornersPerGame,
      },
      {
        metric: "Shots on target / game",
        home: teamComparison.home.seasonStats.shotsOnTargetPerGame,
        away: teamComparison.away.seasonStats.shotsOnTargetPerGame,
      },
    ];
    for (const row of pairs) {
      const h = parseSeasonStat(row.home);
      const a = parseSeasonStat(row.away);
      if (h != null && a != null) {
        statComparison.push({ metric: row.metric, home: h, away: a });
      }
    }
  }

  if (!statComparison.length) {
    const crossLeague = homeLeagueIdForStrength !== awayLeagueIdForStrength;
    const h = crossLeague ? homeStatsBenchmark : homeStats;
    const a = crossLeague ? awayStatsBenchmark : awayStats;
    statComparison.push(
      { metric: "Goals scored / game", home: h.goalsFor, away: a.goalsFor },
      { metric: "Goals conceded / game", home: h.goalsAgainst, away: a.goalsAgainst },
      { metric: "Corners / game", home: h.corners, away: a.corners },
      { metric: "Shots on target / game", home: h.shotsOnTarget, away: a.shotsOnTarget }
    );
  }

  const historicalMarkets =
    teamComparison?.home.insights?.bettingTrends &&
    teamComparison?.away.insights?.bettingTrends
      ? {
          home: {
            bttsYesPct: teamComparison.home.insights.bettingTrends.bttsYesPct,
            over25Pct: teamComparison.home.insights.bettingTrends.over25Pct,
            sampleSize: teamComparison.home.insights.bettingTrends.windowSize,
          },
          away: {
            bttsYesPct: teamComparison.away.insights.bettingTrends.bttsYesPct,
            over25Pct: teamComparison.away.insights.bettingTrends.over25Pct,
            sampleSize: teamComparison.away.insights.bettingTrends.windowSize,
          },
        }
      : undefined;

  const analytics = computeMarketAnalytics(homeXg, awayXg, {
    h2hHomeWinRate: h2h.homeWinRate,
    h2hDrawRate: h2h.drawRate,
    h2hAwayWinRate: h2h.awayWinRate,
    homeFormScore,
    awayFormScore,
    momentumIndex,
    modelImpact: [
      {
        label: `Competition μ (${muResult.source})`,
        homeMultiplier: muResult.mu,
        awayMultiplier: muResult.mu,
      },
      { label: "Lineup", homeMultiplier: lineup.homeXgMultiplier, awayMultiplier: lineup.awayXgMultiplier },
      {
        label: "Weather",
        homeMultiplier: weatherImpact.homeXgMultiplier,
        awayMultiplier: weatherImpact.awayXgMultiplier,
      },
      {
        label: "Stadium & travel",
        homeMultiplier: stadium.homeXgMultiplier,
        awayMultiplier: stadium.awayXgMultiplier,
      },
    ],
    statComparison,
    correlation: scoreCorrelation,
    heatmapMaxGoals: scoreMatrixMaxGoals,
  });

  if (historicalMarkets) {
    analytics.historicalMarkets = historicalMarkets;
  }

  return {
    modelVersion: MODEL_VERSION,
    lineupSource,
    homeTeamName,
    awayTeamName,
    homeTeamShortName,
    awayTeamShortName,
    homeWinPct,
    awayWinPct,
    drawPct,
    firstTeamToScorePct,
    expectedGoals: { home: homeXg, away: awayXg },
    estimated: estimatedMatchStats,
    explanation: explanationParts.join("\n"),
    teamComparison,
    analytics,
    debug: {
      factors: {
        homeFormScore,
        awayFormScore,
        momentumIndex,
        homeLeagueStrength,
        awayLeagueStrength,
        lineupHomeXg: lineup.homeXgMultiplier,
        lineupAwayXg: lineup.awayXgMultiplier,
        weatherHomeXg: weatherImpact.homeXgMultiplier,
        weatherAwayXg: weatherImpact.awayXgMultiplier,
        stadiumHomeXg: stadium.homeXgMultiplier,
        stadiumAwayXg: stadium.awayXgMultiplier,
      },
    },
  };
}
