import { ensureFifaRankingsLoaded } from "@/lib/data/fifa-rankings-store";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import type { MotivationParams } from "@/lib/world-cup/motivation";
import {
  INTERNATIONAL_BASE_GOALS,
  resolveInternationalExpectedGoals,
  resolveInternationalScoreCorrelation,
  wcHubRatesFromHistory,
} from "@/lib/world-cup/international-strength";
import {
  attenuateRhoForExpectedGoalGap,
  buildGuardedScoreMatrix,
  outcomesFromGuardedGrid,
} from "@/lib/world-cup/score-grid";
import {
  computeFinalDelta,
  resolveStadiumVenue,
} from "@/lib/world-cup/stadium-metadata";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import type { GroupStandingRow, WcMatchRow } from "@/lib/world-cup/standings";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";

const MODEL_VERSION = "wc-hub-v4.2";

export interface TeamStrength {
  attack: number;
  defense: number;
}

export interface WorldCupPredictInput {
  match: WcMatchRow;
  homeName: string;
  awayName: string;
  /** @deprecated Prefer homeFormMatches / awayFormMatches (full international history). */
  finishedMatches: WcMatchRow[];
  homeFormMatches?: InternationalFormMatch[];
  awayFormMatches?: InternationalFormMatch[];
  motivation: MotivationParams;
  priorHomeVenueTz: string | null;
  priorAwayVenueTz: string | null;
}

export interface WorldCupPredictionOutput {
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  predicted_score_home: number;
  predicted_score_away: number;
  under_2_5_pct: number;
  over_2_5_pct: number;
  model_version: string;
  snapshot: Record<string, unknown>;
}

/** @deprecated Use wcHubRatesFromHistory — kept for tests importing computeTeamStrength. */
export function computeTeamStrength(
  teamId: string,
  _teamName: string,
  finishedMatches: WcMatchRow[]
): TeamStrength {
  const rates = wcHubRatesFromHistory(teamId, finishedMatches);
  return { attack: rates.attack, defense: rates.defense };
}

function gammaAltitude(
  venueAltitude: number,
  teamHadSimilarAltitude: boolean,
  highPress: boolean
): number {
  if (venueAltitude <= 1500) return 1;
  let g = teamHadSimilarAltitude ? 0.98 : 0.96;
  if (highPress) g -= 0.02;
  return Math.max(0.9, g);
}

/** Capped host-nation lift at a World Cup venue (no compounding with altitude). */
function resolveHostNationXgBoost(
  matchCity: string | null,
  homeName: string
): number {
  const city = (matchCity ?? "").toLowerCase();
  const home = normalizeNationalTeamName(homeName).toLowerCase();
  if (home.includes("mexico") && city.includes("mexico")) return 1.05;
  if (home.includes("united states") && (city.includes("usa") || city.includes("york") || city.includes("angeles"))) {
    return 1.04;
  }
  if (home.includes("canada") && (city.includes("toronto") || city.includes("vancouver"))) {
    return 1.04;
  }
  return 1;
}

function wcFinalsFormSlice(
  teamId: string,
  finishedMatches: WcMatchRow[]
): InternationalFormMatch[] {
  return finishedMatches
    .filter(
      (m) =>
        m.home_goals != null &&
        m.away_goals != null &&
        (m.home_team_id === teamId || m.away_team_id === teamId)
    )
    .map((m) => ({
      date: m.date,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_goals: m.home_goals,
      away_goals: m.away_goals,
      competition: m.competition ?? "FIFA World Cup 2026",
      home_team_name: m.home_team_name,
      away_team_name: m.away_team_name,
    }));
}

function mergeInternationalForm(
  primary: InternationalFormMatch[] | undefined,
  finalsSlice: InternationalFormMatch[]
): InternationalFormMatch[] {
  if (primary?.length) {
    const keys = new Set(primary.map((m) => `${m.date}|${m.home_team_id}|${m.away_team_id}`));
    const extra = finalsSlice.filter(
      (m) => !keys.has(`${m.date}|${m.home_team_id}|${m.away_team_id}`)
    );
    return [...primary, ...extra];
  }
  return finalsSlice;
}

export async function runWorldCupPrediction(
  input: WorldCupPredictInput
): Promise<WorldCupPredictionOutput> {
  await ensureFifaRankingsLoaded();

  const { match, homeName, awayName, finishedMatches, motivation } = input;
  const homeId = match.home_team_id!;
  const awayId = match.away_team_id!;

  const homeForm = mergeInternationalForm(
    input.homeFormMatches,
    wcFinalsFormSlice(homeId, finishedMatches)
  );
  const awayForm = mergeInternationalForm(
    input.awayFormMatches,
    wcFinalsFormSlice(awayId, finishedMatches)
  );

  const homeRates = wcHubRatesFromHistory(homeId, homeForm, homeName);
  const awayRates = wcHubRatesFromHistory(awayId, awayForm, awayName);

  const venue = resolveStadiumVenue(match.venue_city ?? null);
  const altitude = match.venue_altitude_meters ?? venue?.altitude_meters ?? 0;
  const destTz = venue?.timezone ?? "America/New_York";

  const deltaHome = computeFinalDelta(match.rest_hours_home, input.priorHomeVenueTz, destTz);
  const deltaAway = computeFinalDelta(match.rest_hours_away, input.priorAwayVenueTz, destTz);

  const gammaHome = gammaAltitude(altitude, false, false);
  const gammaAway = gammaAltitude(altitude, false, false);
  const hostBoost = resolveHostNationXgBoost(match.venue_city ?? venue?.city ?? null, homeName);

  const baseline = resolveInternationalExpectedGoals({
    homeTeamId: resolveApiTeamId(homeId, homeName),
    awayTeamId: resolveApiTeamId(awayId, awayName),
    homeName,
    awayName,
    homeRates,
    awayRates,
    mu: INTERNATIONAL_BASE_GOALS,
  });

  let lambda =
    baseline.homeXg * gammaHome * deltaHome * motivation.sigmaHome * hostBoost;
  let mu = baseline.awayXg * gammaAway * deltaAway * motivation.sigmaAway;

  const rhoBase =
    resolveInternationalScoreCorrelation(lambda, mu, baseline.snapshot.fifa_rating_delta as number) +
    motivation.rhoOffset;
  const rho = attenuateRhoForExpectedGoalGap(rhoBase, lambda, mu);
  const mutualDraw = motivation.scenario.includes("mutual_draw");

  const outcomes = outcomesFromGuardedGrid(lambda, mu, rho, mutualDraw);
  const grid = buildGuardedScoreMatrix(lambda, mu, rho, mutualDraw);

  const lambdaAttenuationPct =
    altitude > 1500 ? Math.round((1 - gammaHome) * 1000) / 10 : 0;

  return {
    home_win_pct: Number(outcomes.homeWin.toFixed(4)),
    draw_pct: Number(outcomes.draw.toFixed(4)),
    away_win_pct: Number(outcomes.awayWin.toFixed(4)),
    predicted_score_home: outcomes.predictedHome,
    predicted_score_away: outcomes.predictedAway,
    under_2_5_pct: Number(outcomes.under25.toFixed(4)),
    over_2_5_pct: Number(outcomes.over25.toFixed(4)),
    model_version: MODEL_VERSION,
    snapshot: {
      alpha_home: homeRates.attack,
      beta_home: homeRates.defense,
      alpha_away: awayRates.attack,
      beta_away: awayRates.defense,
      lambda,
      mu,
      rho,
      rho_base: rhoBase,
      gamma_home: gammaHome,
      gamma_away: gammaAway,
      host_nation_boost: hostBoost,
      delta_final_home: deltaHome,
      delta_final_away: deltaAway,
      sigma_home: motivation.sigmaHome,
      sigma_away: motivation.sigmaAway,
      scenario: motivation.scenario,
      venue_altitude_meters: altitude,
      lambda_attenuation_pct: lambdaAttenuationPct,
      grid_renormalized: grid.renormalized,
      md3_permutation: motivation.md3Permutation ?? null,
      home_form_match_count: homeForm.length,
      away_form_match_count: awayForm.length,
      home_sample_gf: homeRates.sample.goalsFor,
      away_sample_gf: awayRates.sample.goalsFor,
      ...baseline.snapshot,
    },
  };
}

export function baselineMd3Probs(homeXg: number, awayXg: number) {
  const rho = attenuateRhoForExpectedGoalGap(
    resolveInternationalScoreCorrelation(homeXg, awayXg),
    homeXg,
    awayXg
  );
  const o = outcomesFromGuardedGrid(homeXg, awayXg, rho, false);
  return { pHomeWin: o.homeWin, pDraw: o.draw, pAwayWin: o.awayWin };
}

export function standingsForGroup(
  groupCode: string,
  allStandings: Record<string, GroupStandingRow[]>
): GroupStandingRow[] {
  return allStandings[groupCode] ?? [];
}
