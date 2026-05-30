import {
  computeFormScore,
  computeH2HRates,
  fetchFootballBundle,
  parseTeamStats,
} from "@/lib/api/football";
import { getWeatherForecast } from "@/lib/api/weather";
import { getLeagueStrengthMultiplier } from "@/lib/data/football-reference";
import { computeBaseProbability, computeMomentumIndex } from "@/lib/prediction/base-probability";
import { computeLineupImpact } from "@/lib/prediction/lineup-impact";
import { computeStadiumImpact } from "@/lib/prediction/stadium-impact";
import { computeWeatherImpact } from "@/lib/prediction/weather-impact";
import type { PredictRequest, PredictionResult } from "@/lib/types/prediction";

/** Minimum xG floor before Poisson grid evaluation. */
const XG_FLOOR = 0.3;

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function computeOutcomeProbabilities(
  homeXg: number,
  awayXg: number,
  maxGoals = 8
): { homeWin: number; draw: number; awayWin: number } {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, homeXg) * poissonPmf(a, awayXg);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  const total = homeWin + draw + awayWin;
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  };
}

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

export async function runPrediction(input: PredictRequest): Promise<PredictionResult> {
  const { homeTeamId, awayTeamId, city, matchDate } = input;

  const [bundle, weather] = await Promise.all([
    fetchFootballBundle(input),
    getWeatherForecast(city, matchDate),
  ]);

  const homeStats = parseTeamStats(bundle.homeStats, true);
  const awayStats = parseTeamStats(bundle.awayStats, false);

  const homeFormScore = computeFormScore(bundle.homeForm, homeTeamId);
  const awayFormScore = computeFormScore(bundle.awayForm, awayTeamId);
  const h2h = computeH2HRates(bundle.h2h, homeTeamId);

  const homeLeagueStrength = getLeagueStrengthMultiplier(
    input.homeLeagueId ?? bundle.fixture.league.id
  );
  const awayLeagueStrength = getLeagueStrengthMultiplier(
    input.awayLeagueId ?? bundle.fixture.league.id
  );

  const base = computeBaseProbability({
    homeFormScore,
    awayFormScore,
    h2hHomeWinRate: h2h.homeWinRate,
    h2hDrawRate: h2h.drawRate,
    h2hAwayWinRate: h2h.awayWinRate,
    homeLeagueStrength,
    awayLeagueStrength,
    homeStats,
    awayStats,
  });

  const momentumIndex = computeMomentumIndex({
    homeFormScore,
    awayFormScore,
    h2hHomeWinRate: h2h.homeWinRate,
    h2hDrawRate: h2h.drawRate,
    h2hAwayWinRate: h2h.awayWinRate,
    homeLeagueStrength,
    awayLeagueStrength,
    homeStats,
    awayStats,
  });

  const lineup = computeLineupImpact(
    bundle.lineups,
    bundle.topScorers,
    homeTeamId,
    awayTeamId
  );

  const weatherImpact = computeWeatherImpact(weather, homeStats, awayStats);

  const matchLocation = {
    lat: weather.lat ?? 51.5,
    lon: weather.lon ?? -0.12,
  };

  const awayHomeLocation =
    weather.lat !== undefined
      ? { lat: weather.lat - 0.5, lon: weather.lon ?? -0.12 }
      : null;

  const stadium = computeStadiumImpact(
    bundle.fixture.fixture.venue.name,
    bundle.awayTeamInfo.venue.city,
    matchLocation,
    awayHomeLocation
  );

  let homeXg = base.homeXg;
  let awayXg = base.awayXg;
  const baseCorners = base.corners;
  let fouls = base.fouls;
  let yellowCards = base.yellowCards;
  let redCards = base.redCards;

  homeXg *= lineup.homeXgMultiplier * weatherImpact.homeXgMultiplier * stadium.homeXgMultiplier;
  awayXg *= lineup.awayXgMultiplier * weatherImpact.awayXgMultiplier * stadium.awayXgMultiplier;

  homeXg = Math.max(XG_FLOOR, homeXg);
  awayXg = Math.max(XG_FLOOR, awayXg);

  fouls *= weatherImpact.foulsMultiplier * stadium.foulsMultiplier;
  yellowCards *= weatherImpact.cardsMultiplier * stadium.cardsMultiplier;
  redCards *= weatherImpact.cardsMultiplier * stadium.cardsMultiplier;

  const corners = baseCorners * Math.exp(0.02 * (homeXg + awayXg));

  homeXg = Math.round(homeXg * 100) / 100;
  awayXg = Math.round(awayXg * 100) / 100;

  const probs = computeOutcomeProbabilities(homeXg, awayXg);
  const { homeWinPct, drawPct, awayWinPct } = normalizeTo100(
    probs.homeWin,
    probs.draw,
    probs.awayWin
  );

  const homeTeamName =
    input.homeTeamName?.trim() ||
    bundle.fixture.teams.home.name ||
    bundle.homeTeamInfo.team.name;
  const awayTeamName =
    input.awayTeamName?.trim() ||
    bundle.fixture.teams.away.name ||
    bundle.awayTeamInfo.team.name;

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
    `League strength Ω — ${homeTeamName}: ${homeLeagueStrength.toFixed(2)}, ${awayTeamName}: ${awayLeagueStrength.toFixed(2)}.`,
    `Momentum index: ${momentumIndex.toFixed(3)} (form 60% + H2H 40%).`,
    `${homeTeamName} form score: ${(homeFormScore * 100).toFixed(0)}% | ${awayTeamName} form score: ${(awayFormScore * 100).toFixed(0)}%.`,
    `H2H rates — ${homeTeamName} win: ${(h2h.homeWinRate * 100).toFixed(0)}%, Draw: ${(h2h.drawRate * 100).toFixed(0)}%, ${awayTeamName} win: ${(h2h.awayWinRate * 100).toFixed(0)}%.`,
    `Structural baseline xG (pre-shock): ${homeTeamName} ${base.homeXg.toFixed(2)} — ${awayTeamName} ${base.awayXg.toFixed(2)}.`,
    `Final xG after all adjustments: ${homeTeamName} ${homeXg} — ${awayTeamName} ${awayXg}.`,
  ];

  return {
    homeTeamName,
    awayTeamName,
    homeWinPct,
    awayWinPct,
    drawPct,
    expectedGoals: { home: homeXg, away: awayXg },
    estimated: {
      corners: Math.round(corners * 10) / 10,
      fouls: Math.round(fouls * 10) / 10,
      yellowCards: Math.round(yellowCards * 10) / 10,
      redCards: Math.round(redCards * 10) / 10,
    },
    explanation: explanationParts.join("\n"),
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
