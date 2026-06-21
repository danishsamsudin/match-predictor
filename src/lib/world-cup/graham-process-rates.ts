import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  opponentInInternationalForm,
  pickInternationalFormSideValue,
  resolveInternationalFormTeamSide,
} from "@/lib/world-cup/international-form-team-side";
import {
  INTERNATIONAL_BASE_GOALS,
  INTERNATIONAL_DECAY_PHI,
  RATE_CLAMP_MAX,
  RATE_CLAMP_MIN,
  SHRINKAGE_K,
  internationalDecayWeight,
  internationalMatchTierWeight,
} from "@/lib/world-cup/international-strength";
import { opponentConfederationModifier } from "@/lib/world-cup/confederation-strength";
import { GRAHAM_MU_XG } from "@/lib/world-cup/graham-model-config";

export type ProcessRateFallback = "xg" | "shots" | "goals";

export interface GrahamProcessRates {
  attack: number;
  defense: number;
  sample: {
    xgFor: number;
    xgAgainst: number;
    effectiveWeight: number;
    matchCount: number;
    fallback: ProcessRateFallback;
  };
}

const SOT_TO_XG = 0.32;
const SHOT_TO_XG = 0.1;

function shrinkTowardMean(rate: number, effectiveN: number, shrinkageK = SHRINKAGE_K): number {
  const conf = effectiveN / (effectiveN + shrinkageK);
  return 1 + (rate - 1) * conf;
}

function clampRate(rate: number): number {
  return Math.max(RATE_CLAMP_MIN, Math.min(RATE_CLAMP_MAX, rate));
}

function resolveMatchXgForTeam(
  m: InternationalFormMatch,
  teamId: string,
  side: "for" | "against",
  teamName?: string
): { value: number; fallback: ProcessRateFallback } | null {
  if (!resolveInternationalFormTeamSide(m, teamId, teamName)) return null;

  const xgFor = pickInternationalFormSideValue(m, teamId, teamName, m.home_xg, m.away_xg);
  const xgAgainst = pickInternationalFormSideValue(m, teamId, teamName, m.away_xg, m.home_xg);
  const sotFor = pickInternationalFormSideValue(m, teamId, teamName, m.home_sot, m.away_sot);
  const sotAgainst = pickInternationalFormSideValue(m, teamId, teamName, m.away_sot, m.home_sot);
  const shotsFor = pickInternationalFormSideValue(m, teamId, teamName, m.home_shots, m.away_shots);
  const gf = pickInternationalFormSideValue(m, teamId, teamName, m.home_goals, m.away_goals);
  const ga = pickInternationalFormSideValue(m, teamId, teamName, m.away_goals, m.home_goals);

  const target = side === "for" ? xgFor : xgAgainst;
  if (target != null && Number.isFinite(target)) {
    return { value: target, fallback: "xg" };
  }

  if (side === "for") {
    if (sotFor != null) return { value: sotFor * SOT_TO_XG, fallback: "shots" };
    if (shotsFor != null) return { value: shotsFor * SHOT_TO_XG, fallback: "shots" };
    if (gf != null) return { value: gf, fallback: "goals" };
  } else {
    if (sotAgainst != null) return { value: sotAgainst * SOT_TO_XG, fallback: "shots" };
    const oppShots = pickInternationalFormSideValue(
      m,
      teamId,
      teamName,
      m.away_shots,
      m.home_shots
    );
    if (oppShots != null) return { value: oppShots * SHOT_TO_XG, fallback: "shots" };
    if (ga != null) return { value: ga, fallback: "goals" };
  }
  return null;
}

/**
 * Graham attack/defense rates from weighted xGF/xGA (fallback: shots → goals).
 */
export function computeGrahamProcessRatesFromMatches(
  teamId: string,
  finishedMatches: InternationalFormMatch[],
  referenceMs = Date.now(),
  teamName?: string,
  shrinkageK = SHRINKAGE_K
): GrahamProcessRates {
  let xgf = 0;
  let xga = 0;
  let w = 0;
  let matchCount = 0;
  let dominantFallback: ProcessRateFallback = "xg";
  const fallbackCounts: Record<ProcessRateFallback, number> = {
    xg: 0,
    shots: 0,
    goals: 0,
  };

  for (const m of finishedMatches) {
    if (m.home_goals == null || m.away_goals == null) continue;

    const tier = internationalMatchTierWeight(m.competition);
    const weight = internationalDecayWeight(m.date, referenceMs) * tier;
    if (weight <= 0) continue;

    if (!resolveInternationalFormTeamSide(m, teamId, teamName)) continue;

    const opponent = opponentInInternationalForm(m, teamId, teamName);
    const cOpp = opponentConfederationModifier({
      opponentTeamId: opponent?.id,
      opponentTeamName: opponent?.name,
      competition: m.competition,
    });

    const forSide = resolveMatchXgForTeam(m, teamId, "for", teamName);
    const againstSide = resolveMatchXgForTeam(m, teamId, "against", teamName);
    if (!forSide || !againstSide) continue;

    fallbackCounts[forSide.fallback] += 1;
    fallbackCounts[againstSide.fallback] += 1;

    xgf += forSide.value * weight * cOpp;
    xga += againstSide.value * weight * cOpp;
    w += weight;
    matchCount += 1;
  }

  const mu = GRAHAM_MU_XG ?? INTERNATIONAL_BASE_GOALS;
  if (w < 0.35) {
    return {
      attack: 1,
      defense: 1,
      sample: { xgFor: mu, xgAgainst: mu, effectiveWeight: 0, matchCount: 0, fallback: "goals" },
    };
  }

  if (fallbackCounts.goals >= fallbackCounts.xg && fallbackCounts.goals >= fallbackCounts.shots) {
    dominantFallback = "goals";
  } else if (fallbackCounts.shots > fallbackCounts.xg) {
    dominantFallback = "shots";
  }

  const avgXgf = xgf / w;
  const avgXga = xga / w;

  return {
    attack: shrinkTowardMean(clampRate(avgXgf / mu), w, shrinkageK),
    defense: shrinkTowardMean(clampRate(avgXga / mu), w, shrinkageK),
    sample: {
      xgFor: avgXgf,
      xgAgainst: avgXga,
      effectiveWeight: w,
      matchCount,
      fallback: dominantFallback,
    },
  };
}

export { INTERNATIONAL_DECAY_PHI, internationalMatchTierWeight, opponentConfederationModifier };
