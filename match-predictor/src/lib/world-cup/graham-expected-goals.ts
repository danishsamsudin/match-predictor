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
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import type { SquadTalentSnapshot } from "@/lib/world-cup/national-squad-talent";

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
  const mu = input.mu ?? GRAHAM_MU_XG;
  const homeIdStr = String(input.homeTeamId);
  const awayIdStr = String(input.awayTeamId);

  const homeRates = computeGrahamProcessRatesFromMatches(
    homeIdStr,
    input.homeFormMatches,
    Date.now(),
    input.homeName
  );
  const awayRates = computeGrahamProcessRatesFromMatches(
    awayIdStr,
    input.awayFormMatches,
    Date.now(),
    input.awayName
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

  const deltaS =
    GRAHAM_DELTA_WEIGHTS.xgElo * deltaXgElo +
    GRAHAM_DELTA_WEIGHTS.talent * (deltaTalent * 400) +
    GRAHAM_DELTA_WEIGHTS.tournament * deltaTournament +
    GRAHAM_DELTA_WEIGHTS.recentXgForm * (deltaRecentForm * 100) +
    GRAHAM_DELTA_WEIGHTS.fifa * deltaFifa +
    GRAHAM_DELTA_WEIGHTS.momentum * deltaMomentum;

  let homeXg = clampInternationalBaselineXg(mu * Math.exp(GRAHAM_STRENGTH_EXPONENT * deltaS));
  let awayXg = clampInternationalBaselineXg(mu * Math.exp(-GRAHAM_STRENGTH_EXPONENT * deltaS));

  const withMomentum = applyGrahamMomentumToXg(homeXg, awayXg, momentum);
  homeXg = Math.max(INTERNATIONAL_XG_FLOOR, withMomentum.homeXg);
  awayXg = Math.max(INTERNATIONAL_XG_FLOOR, withMomentum.awayXg);

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
      graham_weights: GRAHAM_DELTA_WEIGHTS,
    },
  };
}
