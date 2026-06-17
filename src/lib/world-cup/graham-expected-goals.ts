import { getFifaRankingPoints, resolveNationalTeamForStrength } from "@/lib/prediction/fifa-team-strength";
import {
  clampInternationalBaselineXg,
  INTERNATIONAL_XG_FLOOR,
} from "@/lib/world-cup/international-strength";
import { computeGrahamProcessRatesFromMatches } from "@/lib/world-cup/graham-process-rates";
import { applyShotProfilesForFixture, computeShotProfileFromMatches } from "@/lib/world-cup/graham-shot-profiles";
import { computeXgEloFromMatches, getXgEloRating } from "@/lib/world-cup/graham-xg-elo";
import { computeWctrFromMatches, getWctrRating } from "@/lib/world-cup/graham-tournament-rating";
import {
  applyGrahamMomentumToXg,
  computeGrahamMomentumIndex,
} from "@/lib/world-cup/graham-momentum";
import {
  GRAHAM_DELTA_WEIGHTS,
  GRAHAM_MU_XG,
  GRAHAM_STRENGTH_EXPONENT,
} from "@/lib/world-cup/graham-model-config";
import type { WcCalibrationConstants } from "@/lib/world-cup/wc-calibration-config";
import { normalizeDeltaWeights } from "@/lib/world-cup/wc-calibration-config";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import type { SquadTalentSnapshot } from "@/lib/world-cup/national-squad-talent";
import {
  applyFinishingRegressionToXg,
  applyWcFormToProcessRates,
  type WcInTournamentFormNudges,
} from "@/lib/world-cup/graham-wc-in-tournament-form";

export interface GrahamExpectedGoalsInput {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  homeFormMatches: InternationalFormMatch[];
  awayFormMatches: InternationalFormMatch[];
  allFormMatches: InternationalFormMatch[];
  homeTalent: SquadTalentSnapshot;
  awayTalent: SquadTalentSnapshot;
  medianSquadValueEur: number;
  mu?: number;
  calibration?: WcCalibrationConstants;
  wcForm?: {
    home: WcInTournamentFormNudges;
    away: WcInTournamentFormNudges;
  };
}

export interface GrahamExpectedGoalsResult {
  homeXg: number;
  awayXg: number;
  deltaS: number;
  snapshot: Record<string, unknown>;
}

function fifaRating(teamId: number, teamName: string): number {
  const resolved = resolveNationalTeamForStrength(teamId, teamName);
  return getFifaRankingPoints(resolved.teamId, resolved.teamName ?? teamName) ?? 1400;
}

export function resolveGrahamExpectedGoals(input: GrahamExpectedGoalsInput): GrahamExpectedGoalsResult {
  const cal = input.calibration;
  const mu = input.mu ?? cal?.muXg ?? GRAHAM_MU_XG;
  const strengthExponent = cal?.strengthExponent ?? GRAHAM_STRENGTH_EXPONENT;
  const weights = normalizeDeltaWeights(cal?.deltaWeights ?? GRAHAM_DELTA_WEIGHTS);
  const homeIdStr = String(input.homeTeamId);
  const awayIdStr = String(input.awayTeamId);

  const homeRates = applyWcFormToProcessRates(
    computeGrahamProcessRatesFromMatches(
      homeIdStr,
      input.homeFormMatches,
      Date.now(),
      input.homeName
    ),
    input.wcForm?.home ?? { attackNudge: 1, defenseNudge: 1, finishingRegression: 0, matchCount: 0, avgChanceIndex: 1.5, avgDefensiveSolidity: 1.5 },
    cal
  );
  const awayRates = applyWcFormToProcessRates(
    computeGrahamProcessRatesFromMatches(
      awayIdStr,
      input.awayFormMatches,
      Date.now(),
      input.awayName
    ),
    input.wcForm?.away ?? { attackNudge: 1, defenseNudge: 1, finishingRegression: 0, matchCount: 0, avgChanceIndex: 1.5, avgDefensiveSolidity: 1.5 },
    cal
  );

  const homeProfile = computeShotProfileFromMatches(homeIdStr, input.homeFormMatches);
  const awayProfile = computeShotProfileFromMatches(awayIdStr, input.awayFormMatches);

  const adjusted = applyShotProfilesForFixture(
    homeRates.attack,
    homeRates.defense,
    awayRates.attack,
    awayRates.defense,
    homeProfile,
    awayProfile
  );

  const recentFormHome = mu * adjusted.homeAttack * adjusted.awayDefense;
  const recentFormAway = mu * adjusted.awayAttack * adjusted.homeDefense;

  const teamIds = [input.homeTeamId, input.awayTeamId];
  const teamNames = new Map<number, string>([
    [input.homeTeamId, input.homeName],
    [input.awayTeamId, input.awayName],
  ]);

  const combinedMatches = input.allFormMatches;
  const xgEloMap = computeXgEloFromMatches(combinedMatches, teamIds, teamNames);
  const wctrMap = computeWctrFromMatches(combinedMatches, teamIds, teamNames);

  const homeXgElo = getXgEloRating(xgEloMap, input.homeTeamId, input.homeName);
  const awayXgElo = getXgEloRating(xgEloMap, input.awayTeamId, input.awayName);
  const homeWctr = getWctrRating(wctrMap, input.homeTeamId, input.homeName);
  const awayWctr = getWctrRating(wctrMap, input.awayTeamId, input.awayName);

  const homeFifa = fifaRating(input.homeTeamId, input.homeName);
  const awayFifa = fifaRating(input.awayTeamId, input.awayName);

  const momentum = computeGrahamMomentumIndex({
    homeFormMatches: input.homeFormMatches,
    awayFormMatches: input.awayFormMatches,
    homeTeamId: homeIdStr,
    awayTeamId: awayIdStr,
  });

  const deltaXgElo = homeXgElo - awayXgElo;
  const deltaTalent = input.homeTalent.talentRating - input.awayTalent.talentRating;
  const deltaTournament = homeWctr - awayWctr;
  const deltaRecentForm = recentFormHome - recentFormAway;
  const deltaFifa = homeFifa - awayFifa;
  const deltaMomentum = momentum * 120;

  let optaDelta = 0;
  const optaWeights = cal?.optaFeatureWeights ?? {};
  const optaInputs = input.wcForm
    ? {
        chance_index_diff:
          (input.wcForm.home.avgChanceIndex - input.wcForm.away.avgChanceIndex),
        defensive_solidity_diff:
          (input.wcForm.home.avgDefensiveSolidity - input.wcForm.away.avgDefensiveSolidity),
        finishing_regression_diff:
          (input.wcForm.home.finishingRegression - input.wcForm.away.finishingRegression),
        wc_form_matches_diff:
          (input.wcForm.home.matchCount - input.wcForm.away.matchCount) / 3,
      }
    : {};
  for (const [key, coef] of Object.entries(optaWeights)) {
    if (Math.abs(coef) < 1e-9) continue;
    const val = optaInputs[key as keyof typeof optaInputs];
    if (typeof val === "number" && Number.isFinite(val)) optaDelta += coef * val;
  }

  const deltaS =
    weights.xgElo * deltaXgElo +
    weights.talent * (deltaTalent * 400) +
    weights.tournament * deltaTournament +
    weights.recentXgForm * (deltaRecentForm * 100) +
    weights.fifa * deltaFifa +
    weights.momentum * deltaMomentum +
    optaDelta;

  let homeXg = clampInternationalBaselineXg(mu * Math.exp(strengthExponent * deltaS));
  let awayXg = clampInternationalBaselineXg(mu * Math.exp(-strengthExponent * deltaS));

  const awaySetPieceRate = cal?.teamSetPieceRates?.[String(input.awayTeamId)];
  if (
    cal &&
    awaySetPieceRate != null &&
    awaySetPieceRate >= cal.setPieceRateThreshold
  ) {
    awayXg = clampInternationalBaselineXg(awayXg + cal.setPieceXgBump);
  }

  const withMomentum = applyGrahamMomentumToXg(homeXg, awayXg, momentum);
  const regressed = applyFinishingRegressionToXg(
    withMomentum.homeXg,
    withMomentum.awayXg,
    input.wcForm?.home ?? { attackNudge: 1, defenseNudge: 1, finishingRegression: 0, matchCount: 0, avgChanceIndex: 1.5, avgDefensiveSolidity: 1.5 },
    input.wcForm?.away ?? { attackNudge: 1, defenseNudge: 1, finishingRegression: 0, matchCount: 0, avgChanceIndex: 1.5, avgDefensiveSolidity: 1.5 }
  );
  homeXg = Math.max(INTERNATIONAL_XG_FLOOR, regressed.homeXg);
  awayXg = Math.max(INTERNATIONAL_XG_FLOOR, regressed.awayXg);

  return {
    homeXg: Math.round(homeXg * 100) / 100,
    awayXg: Math.round(awayXg * 100) / 100,
    deltaS: Math.round(deltaS * 1000) / 1000,
    snapshot: {
      mu,
      delta_s: Math.round(deltaS * 1000) / 1000,
      delta_xg_elo: deltaXgElo,
      delta_talent: deltaTalent,
      delta_tournament: deltaTournament,
      delta_recent_form: deltaRecentForm,
      delta_fifa: deltaFifa,
      momentum_index: momentum,
      home_attack: adjusted.homeAttack,
      home_defense: adjusted.homeDefense,
      away_attack: adjusted.awayAttack,
      away_defense: adjusted.awayDefense,
      home_sci: homeProfile.sci,
      home_ssi: homeProfile.ssi,
      away_sci: awayProfile.sci,
      away_ssi: awayProfile.ssi,
      home_xg_elo: homeXgElo,
      away_xg_elo: awayXgElo,
      home_wctr: homeWctr,
      away_wctr: awayWctr,
      home_fifa_pts: homeFifa,
      away_fifa_pts: awayFifa,
      home_talent_eur: input.homeTalent.squadValueEur,
      away_talent_eur: input.awayTalent.squadValueEur,
      home_talent_source: input.homeTalent.source,
      away_talent_source: input.awayTalent.source,
      home_form_fallback: homeRates.sample.fallback,
      away_form_fallback: awayRates.sample.fallback,
      graham_weights: weights,
      calibration_version: cal?.modelVersion ?? null,
      away_set_piece_rate: awaySetPieceRate ?? null,
      set_piece_xg_bump_applied:
        awaySetPieceRate != null && cal && awaySetPieceRate >= cal.setPieceRateThreshold
          ? cal.setPieceXgBump
          : 0,
      wc_form_home_matches: input.wcForm?.home.matchCount ?? 0,
      wc_form_away_matches: input.wcForm?.away.matchCount ?? 0,
      wc_attack_nudge_home: input.wcForm?.home.attackNudge ?? 1,
      wc_attack_nudge_away: input.wcForm?.away.attackNudge ?? 1,
      finishing_regression_home: input.wcForm?.home.finishingRegression ?? 0,
      finishing_regression_away: input.wcForm?.away.finishingRegression ?? 0,
      opta_features: optaInputs,
      opta_delta_s: Math.round(optaDelta * 1000) / 1000,
    },
  };
}
