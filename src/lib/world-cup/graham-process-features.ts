import type { MatchProcessPayload } from "@/lib/world-cup/enrich-form-process-metrics";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  opponentInInternationalForm,
  pickInternationalFormSideValue,
  resolveInternationalFormTeamSide,
} from "@/lib/world-cup/international-form-team-side";
import {
  internationalDecayWeight,
  internationalMatchTierWeight,
  SHRINKAGE_K,
} from "@/lib/world-cup/international-strength";
import { opponentConfederationModifier } from "@/lib/world-cup/confederation-strength";

export interface TeamProcessProfile {
  chanceQuality: number;
  setPieceXgShare: number;
  boxXgShare: number;
  finishingSkill: number;
  pressingIntensity: number;
  sampleWeight: number;
}

export interface ProcessFeatureSnapshot {
  chance_quality_diff: number;
  set_piece_xg_share_diff: number;
  box_xg_share_diff: number;
  finishing_skill_diff: number;
  pressing_intensity_diff: number;
}

const DEFAULT_CHANCE_QUALITY = 0.1;
const DEFAULT_SET_PIECE_SHARE = 0.18;
const DEFAULT_BOX_SHARE = 0.55;
const FINISHING_PRIOR_STRENGTH = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sidePayload(
  payload: MatchProcessPayload | null | undefined,
  teamId: string,
  match: InternationalFormMatch,
  teamName?: string
): Record<string, number> | null {
  if (!payload) return null;
  const side = resolveInternationalFormTeamSide(match, teamId, teamName);
  if (side === "home" && payload.home) return payload.home;
  if (side === "away" && payload.away) return payload.away;
  return null;
}

function teamXgFor(
  m: InternationalFormMatch,
  teamId: string,
  teamName?: string
): number | null {
  const xg = pickInternationalFormSideValue(m, teamId, teamName, m.home_xg, m.away_xg);
  if (xg != null) return xg;
  return pickInternationalFormSideValue(m, teamId, teamName, m.home_goals, m.away_goals);
}

function teamShotsFor(
  m: InternationalFormMatch,
  teamId: string,
  teamName?: string
): number {
  const shots = pickInternationalFormSideValue(m, teamId, teamName, m.home_shots, m.away_shots);
  if (shots != null && shots > 0) return shots;
  const sot = pickInternationalFormSideValue(m, teamId, teamName, m.home_sot, m.away_sot);
  if (sot != null && sot > 0) return Math.max(1, sot * 2.5);
  return 1;
}

function teamGoalsFor(
  m: InternationalFormMatch,
  teamId: string,
  teamName?: string
): number | null {
  return pickInternationalFormSideValue(m, teamId, teamName, m.home_goals, m.away_goals);
}

function shrinkFinishing(goalsMinusXg: number, shotCount: number): number {
  const conf = shotCount / (shotCount + FINISHING_PRIOR_STRENGTH);
  return goalsMinusXg * conf;
}

function matchWeight(
  m: InternationalFormMatch,
  teamId: string,
  referenceMs: number,
  teamName?: string
): number {
  if (!m.date) return 0;
  if (!resolveInternationalFormTeamSide(m, teamId, teamName)) return 0;
  const tier = internationalMatchTierWeight(m.competition);
  const decay = internationalDecayWeight(m.date, referenceMs);
  const opponent = opponentInInternationalForm(m, teamId, teamName);
  const cOpp = opponentConfederationModifier({
    opponentTeamId: opponent?.id,
    opponentTeamName: opponent?.name,
    competition: m.competition,
  });
  return decay * tier * cOpp;
}

function sideMetricsFromMatch(
  m: InternationalFormMatch,
  teamId: string,
  teamName?: string
): {
  chanceQuality: number;
  setPieceXgShare: number;
  boxXgShare: number;
  finishingSkill: number;
  pressingIntensity: number;
} {
  const xg = teamXgFor(m, teamId, teamName) ?? 0;
  const shots = teamShotsFor(m, teamId, teamName);
  const goals = teamGoalsFor(m, teamId, teamName);
  const side = sidePayload(m.processPayload, teamId, m, teamName);

  const xgOpen = num(side?.xg_open_play);
  const xgSet = num(side?.xg_set_piece);
  const xgBox = num(side?.xg_box);
  const totalXgFromPayload = xgOpen + xgSet;
  const effectiveXg = totalXgFromPayload > 0 ? totalXgFromPayload : xg;

  const chanceQuality = effectiveXg > 0 && shots > 0 ? effectiveXg / shots : DEFAULT_CHANCE_QUALITY;
  const setPieceXgShare =
    effectiveXg > 0 ? clamp(xgSet / effectiveXg, 0, 1) : DEFAULT_SET_PIECE_SHARE;
  const boxXgShare =
    effectiveXg > 0 ? clamp(xgBox / effectiveXg, 0, 1) : DEFAULT_BOX_SHARE;

  const goalsMinusXg =
    side?.goals_minus_xg != null
      ? num(side.goals_minus_xg)
      : goals != null
        ? goals - xg
        : 0;
  const finishingSkill = shrinkFinishing(goalsMinusXg, shots);

  const pressureEvents = num(side?.pressure_events);
  const defensiveActions = num(side?.defensive_actions);
  const pressingIntensity = clamp(
    (pressureEvents + defensiveActions * 0.25) / Math.max(1, shots + 8),
    0,
    2.5
  );

  return {
    chanceQuality,
    setPieceXgShare,
    boxXgShare,
    finishingSkill,
    pressingIntensity,
  };
}

export function computeTeamProcessProfile(
  teamId: string,
  matches: InternationalFormMatch[],
  referenceMs = Date.now(),
  teamName?: string
): TeamProcessProfile {
  let w = 0;
  let chanceQuality = 0;
  let setPieceXgShare = 0;
  let boxXgShare = 0;
  let finishingSkill = 0;
  let pressingIntensity = 0;

  for (const m of matches) {
    if (m.home_goals == null || m.away_goals == null) continue;
    if (!resolveInternationalFormTeamSide(m, teamId, teamName)) continue;

    const weight = matchWeight(m, teamId, referenceMs, teamName);
    if (weight <= 0) continue;

    const side = sideMetricsFromMatch(m, teamId, teamName);
    chanceQuality += side.chanceQuality * weight;
    setPieceXgShare += side.setPieceXgShare * weight;
    boxXgShare += side.boxXgShare * weight;
    finishingSkill += side.finishingSkill * weight;
    pressingIntensity += side.pressingIntensity * weight;
    w += weight;
  }

  if (w <= 0) {
    return {
      chanceQuality: DEFAULT_CHANCE_QUALITY,
      setPieceXgShare: DEFAULT_SET_PIECE_SHARE,
      boxXgShare: DEFAULT_BOX_SHARE,
      finishingSkill: 0,
      pressingIntensity: 1,
      sampleWeight: 0,
    };
  }

  const effectiveN = w;
  const conf = effectiveN / (effectiveN + SHRINKAGE_K);

  return {
    chanceQuality:
      DEFAULT_CHANCE_QUALITY + (chanceQuality / w - DEFAULT_CHANCE_QUALITY) * conf,
    setPieceXgShare:
      DEFAULT_SET_PIECE_SHARE + (setPieceXgShare / w - DEFAULT_SET_PIECE_SHARE) * conf,
    boxXgShare: DEFAULT_BOX_SHARE + (boxXgShare / w - DEFAULT_BOX_SHARE) * conf,
    finishingSkill: finishingSkill / w,
    pressingIntensity: pressingIntensity / w,
    sampleWeight: w,
  };
}

export function computeProcessFeatureDiffs(
  homeTeamId: string,
  awayTeamId: string,
  homeMatches: InternationalFormMatch[],
  awayMatches: InternationalFormMatch[],
  referenceMs = Date.now(),
  homeName?: string,
  awayName?: string
): ProcessFeatureSnapshot {
  const home = computeTeamProcessProfile(homeTeamId, homeMatches, referenceMs, homeName);
  const away = computeTeamProcessProfile(awayTeamId, awayMatches, referenceMs, awayName);

  return {
    chance_quality_diff: home.chanceQuality - away.chanceQuality,
    set_piece_xg_share_diff: home.setPieceXgShare - away.setPieceXgShare,
    box_xg_share_diff: home.boxXgShare - away.boxXgShare,
    finishing_skill_diff: home.finishingSkill - away.finishingSkill,
    pressing_intensity_diff: home.pressingIntensity - away.pressingIntensity,
  };
}
