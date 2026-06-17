import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  internationalDecayWeight,
  internationalMatchTierWeight,
} from "@/lib/world-cup/international-strength";
import { opponentConfederationModifier } from "@/lib/world-cup/confederation-strength";
import { GRAHAM_SCI_WEIGHT, GRAHAM_SSI_WEIGHT } from "@/lib/world-cup/graham-model-config";

const SOT_TO_XG = 0.32;
const SHOT_TO_XG = 0.1;

export interface ShotProfile {
  sci: number;
  ssi: number;
  sampleWeight: number;
}

function teamXgFor(m: InternationalFormMatch, teamId: string): number | null {
  const isHome = m.home_team_id === teamId;
  const isAway = m.away_team_id === teamId;
  if (!isHome && !isAway) return null;
  const xg = isHome ? m.home_xg : m.away_xg;
  if (xg != null) return xg;
  const sot = isHome ? m.home_sot : m.away_sot;
  if (sot != null) return sot * SOT_TO_XG;
  const shots = isHome ? m.home_shots : m.away_shots;
  if (shots != null) return shots * SHOT_TO_XG;
  const goals = isHome ? m.home_goals : m.away_goals;
  return goals;
}

function teamXgAgainst(m: InternationalFormMatch, teamId: string): number | null {
  const isHome = m.home_team_id === teamId;
  const isAway = m.away_team_id === teamId;
  if (!isHome && !isAway) return null;
  const xga = isHome ? m.away_xg : m.home_xg;
  if (xga != null) return xga;
  const sotA = isHome ? m.away_sot : m.home_sot;
  if (sotA != null) return sotA * SOT_TO_XG;
  const shotsA = isHome ? m.away_shots : m.home_shots;
  if (shotsA != null) return shotsA * SHOT_TO_XG;
  const ga = isHome ? m.away_goals : m.home_goals;
  return ga;
}

function teamShots(m: InternationalFormMatch, teamId: string): number {
  const isHome = m.home_team_id === teamId;
  const shots = isHome ? m.home_shots : m.away_shots;
  const sot = isHome ? m.home_sot : m.away_sot;
  if (shots != null && shots > 0) return shots;
  if (sot != null && sot > 0) return Math.max(1, sot * 2.5);
  return 1;
}

function oppShots(m: InternationalFormMatch, teamId: string): number {
  const isHome = m.home_team_id === teamId;
  const shots = isHome ? m.away_shots : m.home_shots;
  const sot = isHome ? m.away_sot : m.home_sot;
  if (shots != null && shots > 0) return shots;
  if (sot != null && sot > 0) return Math.max(1, sot * 2.5);
  return 1;
}

export function computeShotProfileFromMatches(
  teamId: string,
  matches: InternationalFormMatch[],
  referenceMs = Date.now()
): ShotProfile {
  let sciSum = 0;
  let ssiSum = 0;
  let w = 0;

  for (const m of matches) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const tier = internationalMatchTierWeight(m.competition);
    const weight =
      internationalDecayWeight(m.date, referenceMs) *
      tier *
      opponentConfederationModifier({
        opponentTeamId: m.home_team_id === teamId ? m.away_team_id : m.home_team_id,
        opponentTeamName: m.home_team_id === teamId ? m.away_team_name : m.home_team_name,
        competition: m.competition,
      });
    if (weight <= 0) continue;

    const xgf = teamXgFor(m, teamId);
    const xga = teamXgAgainst(m, teamId);
    if (xgf == null || xga == null) continue;

    sciSum += (xgf / teamShots(m, teamId)) * weight;
    ssiSum += (xga / oppShots(m, teamId)) * weight;
    w += weight;
  }

  if (w <= 0) {
    return { sci: 0.1, ssi: 0.1, sampleWeight: 0 };
  }

  return {
    sci: sciSum / w,
    ssi: ssiSum / w,
    sampleWeight: w,
  };
}

export function applyShotProfileToRates(
  attack: number,
  defense: number,
  homeProfile: ShotProfile,
  awayProfile: ShotProfile,
  leagueSci = 0.1,
  leagueSsi = 0.1
): { attack: number; defense: number } {
  const homeAttackMult = 1 + GRAHAM_SCI_WEIGHT * (homeProfile.sci - leagueSci);
  const awayDefenseMult = 1 + GRAHAM_SSI_WEIGHT * (leagueSsi - awayProfile.ssi);
  const awayAttackMult = 1 + GRAHAM_SCI_WEIGHT * (awayProfile.sci - leagueSci);
  const homeDefenseMult = 1 + GRAHAM_SSI_WEIGHT * (leagueSsi - homeProfile.ssi);

  return {
    attack: attack * homeAttackMult,
    defense: defense * awayDefenseMult,
  };
}

export function applyShotProfilesForFixture(
  homeAttack: number,
  homeDefense: number,
  awayAttack: number,
  awayDefense: number,
  homeProfile: ShotProfile,
  awayProfile: ShotProfile
): {
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
} {
  const leagueSci = (homeProfile.sci + awayProfile.sci) / 2 || 0.1;
  const leagueSsi = (homeProfile.ssi + awayProfile.ssi) / 2 || 0.1;

  return {
    homeAttack: homeAttack * (1 + GRAHAM_SCI_WEIGHT * (homeProfile.sci - leagueSci)),
    homeDefense: homeDefense * (1 + GRAHAM_SSI_WEIGHT * (leagueSsi - homeProfile.ssi)),
    awayAttack: awayAttack * (1 + GRAHAM_SCI_WEIGHT * (awayProfile.sci - leagueSci)),
    awayDefense: awayDefense * (1 + GRAHAM_SSI_WEIGHT * (leagueSsi - awayProfile.ssi)),
  };
}
