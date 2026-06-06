/**
 * Compare Graham composite model vs legacy goal/FIFA model on finished international fixtures.
 *
 * Usage: npx tsx scripts/backtest-graham-vs-v21.ts
 */
import { resolveGrahamExpectedGoals } from "../src/lib/world-cup/graham-expected-goals";
import { resolveInternationalExpectedGoals, wcHubRatesFromHistory } from "../src/lib/world-cup/international-strength";
import { computeOutcomeProbabilities } from "../src/lib/prediction/market-probabilities";
import { resolveInternationalScoreCorrelation } from "../src/lib/world-cup/international-strength";
import type { InternationalFormMatch } from "../src/lib/world-cup/load-international-form";

const sampleFixtures: Array<{
  label: string;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  homeForm: InternationalFormMatch[];
  awayForm: InternationalFormMatch[];
  actual: "home" | "draw" | "away";
}> = [
  {
    label: "Germany vs Curaçao (process gap)",
    homeId: 4711,
    awayId: 55827,
    homeName: "Germany",
    awayName: "Curaçao",
    homeForm: [
      {
        date: "2026-01-01",
        home_team_id: "4711",
        away_team_id: "55827",
        home_goals: 4,
        home_xg: 3.2,
        away_goals: 0,
        away_xg: 0.4,
        competition: "Friendly",
      },
    ],
    awayForm: [],
    actual: "home",
  },
  {
    label: "Balanced xG draw",
    homeId: 4698,
    awayId: 4713,
    homeName: "Spain",
    awayName: "England",
    homeForm: [
      {
        date: "2026-01-01",
        home_team_id: "4698",
        away_team_id: "4713",
        home_goals: 1,
        home_xg: 1.3,
        away_goals: 1,
        away_xg: 1.2,
        competition: "UEFA Nations League",
      },
    ],
    awayForm: [
      {
        date: "2026-01-01",
        home_team_id: "4698",
        away_team_id: "4713",
        home_goals: 1,
        home_xg: 1.3,
        away_goals: 1,
        away_xg: 1.2,
        competition: "UEFA Nations League",
      },
    ],
    actual: "draw",
  },
];

function brier(probs: { home: number; draw: number; away: number }, actual: "home" | "draw" | "away") {
  const target = {
    home: actual === "home" ? 1 : 0,
    draw: actual === "draw" ? 1 : 0,
    away: actual === "away" ? 1 : 0,
  };
  return (
    (probs.home - target.home) ** 2 +
    (probs.draw - target.draw) ** 2 +
    (probs.away - target.away) ** 2
  );
}

function legacyPredict(
  homeId: number,
  awayId: number,
  homeName: string,
  awayName: string,
  homeForm: InternationalFormMatch[],
  awayForm: InternationalFormMatch[]
) {
  const homeRates = wcHubRatesFromHistory(String(homeId), homeForm, homeName);
  const awayRates = wcHubRatesFromHistory(String(awayId), awayForm, awayName);
  const baseline = resolveInternationalExpectedGoals({
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeName,
    awayName,
    homeRates,
    awayRates,
  });
  const rho = resolveInternationalScoreCorrelation(
    baseline.homeXg,
    baseline.awayXg,
    baseline.snapshot.fifa_rating_delta as number
  );
  const probs = computeOutcomeProbabilities(baseline.homeXg, baseline.awayXg, 8, { correlation: rho });
  return probs;
}

function grahamPredict(
  homeId: number,
  awayId: number,
  homeName: string,
  awayName: string,
  homeForm: InternationalFormMatch[],
  awayForm: InternationalFormMatch[]
) {
  const all = [...homeForm, ...awayForm];
  const deduped = [...new Map(all.map((m) => [`${m.date}|${m.home_team_id}|${m.away_team_id}`, m])).values()];
  const baseline = resolveGrahamExpectedGoals({
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeName,
    awayName,
    homeFormMatches: homeForm,
    awayFormMatches: awayForm,
    allFormMatches: deduped,
    homeTalent: {
      squadValueEur: homeId === 4711 ? 900_000_000 : 400_000_000,
      talentRating: homeId === 4711 ? 0.8 : 0.2,
      scoutlystValueEur: null,
      transfermarktValueEur: null,
      source: "backtest",
    },
    awayTalent: {
      squadValueEur: awayId === 55827 ? 80_000_000 : 350_000_000,
      talentRating: awayId === 55827 ? -0.5 : 0.15,
      scoutlystValueEur: null,
      transfermarktValueEur: null,
      source: "backtest",
    },
    medianSquadValueEur: 200_000_000,
  });
  const rho = resolveInternationalScoreCorrelation(
    baseline.homeXg,
    baseline.awayXg,
    baseline.snapshot.delta_fifa as number
  );
  return computeOutcomeProbabilities(baseline.homeXg, baseline.awayXg, 8, { correlation: rho });
}

let legacyBrier = 0;
let grahamBrier = 0;

for (const fx of sampleFixtures) {
  const legacy = legacyPredict(
    fx.homeId,
    fx.awayId,
    fx.homeName,
    fx.awayName,
    fx.homeForm,
    fx.awayForm
  );
  const graham = grahamPredict(
    fx.homeId,
    fx.awayId,
    fx.homeName,
    fx.awayName,
    fx.homeForm,
    fx.awayForm
  );
  const lb = brier(
    { home: legacy.homeWin, draw: legacy.draw, away: legacy.awayWin },
    fx.actual
  );
  const gb = brier(
    { home: graham.homeWin, draw: graham.draw, away: graham.awayWin },
    fx.actual
  );
  legacyBrier += lb;
  grahamBrier += gb;
  console.log(
    `${fx.label}: legacy Brier=${lb.toFixed(3)} (H ${(legacy.homeWin * 100).toFixed(1)}% / D ${(legacy.draw * 100).toFixed(1)}% / A ${(legacy.awayWin * 100).toFixed(1)}%) | Graham Brier=${gb.toFixed(3)} (H ${(graham.homeWin * 100).toFixed(1)}% / D ${(graham.draw * 100).toFixed(1)}% / A ${(graham.awayWin * 100).toFixed(1)}%)`
  );
}

console.log(
  `\nAggregate Brier (lower is better): legacy=${legacyBrier.toFixed(3)} graham=${grahamBrier.toFixed(3)}`
);
