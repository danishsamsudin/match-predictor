import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  isTeamInInternationalFormMatch,
  pickInternationalFormSideValue,
  resolveInternationalFormTeamSide,
  teamGoalsInInternationalForm,
} from "@/lib/world-cup/international-form-team-side";
import {
  GRAHAM_MOMENTUM_CLAMP,
  GRAHAM_MOMENTUM_GAMMA,
  GRAHAM_W1_FORM,
  GRAHAM_W2_H2H,
} from "@/lib/world-cup/graham-model-config";

/** Same recency decay as form-momentum.ts (most recent first). */
const FORM_RECENCY_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1];

const XG_DIFF_SCALE = 2.4;

function teamXgDiff(
  m: InternationalFormMatch,
  teamId: string,
  teamName?: string
): number | null {
  if (!resolveInternationalFormTeamSide(m, teamId, teamName)) return null;

  const xgf =
    pickInternationalFormSideValue(m, teamId, teamName, m.home_xg, m.away_xg) ??
    teamGoalsInInternationalForm(m, teamId, teamName)?.goalsFor;
  const xga =
    pickInternationalFormSideValue(m, teamId, teamName, m.away_xg, m.home_xg) ??
    teamGoalsInInternationalForm(m, teamId, teamName)?.goalsAgainst;
  if (xgf == null || xga == null) return null;
  return xgf - xga;
}

export function computeGrahamXgFormScore(
  matches: InternationalFormMatch[],
  teamId: string,
  maxMatches = 5,
  teamName?: string
): number {
  const recent = matches.slice(0, maxMatches);
  if (!recent.length) return 0.5;

  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < recent.length; i++) {
    const diff = teamXgDiff(recent[i], teamId, teamName);
    if (diff == null) continue;
    const normalized = Math.max(0, Math.min(1, (diff + XG_DIFF_SCALE) / (2 * XG_DIFF_SCALE)));
    const w = FORM_RECENCY_WEIGHTS[i] ?? FORM_RECENCY_WEIGHTS.at(-1)!;
    weighted += normalized * w;
    weightSum += w;
  }
  if (weightSum <= 0) return 0.5;
  return weighted / weightSum;
}

export function computeGrahamH2HStrength(
  matches: InternationalFormMatch[],
  homeTeamId: string,
  awayTeamId: string,
  homeName?: string,
  awayName?: string
): number {
  const h2h = matches.filter(
    (m) =>
      isTeamInInternationalFormMatch(m, homeTeamId, homeName) &&
      isTeamInInternationalFormMatch(m, awayTeamId, awayName)
  );
  if (!h2h.length) return 0;

  let homeEdge = 0;
  let w = 0;
  for (let i = 0; i < h2h.length; i++) {
    const diff = teamXgDiff(h2h[i], homeTeamId, homeName);
    if (diff == null) continue;
    const weight = Math.pow(0.88, i);
    homeEdge += (diff / XG_DIFF_SCALE) * weight;
    w += weight;
  }
  if (w <= 0) return 0;
  return Math.max(-1, Math.min(1, homeEdge / w));
}

export interface GrahamH2HRates {
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  hasData: boolean;
}

/** Head-to-head 1X2 rates from the upcoming home team's perspective. */
export function computeGrahamH2HRates(
  matches: InternationalFormMatch[],
  homeTeamId: string,
  awayTeamId: string,
  homeName?: string,
  awayName?: string
): GrahamH2HRates {
  const h2h = matches
    .filter(
      (m) =>
        m.home_goals != null &&
        m.away_goals != null &&
        isTeamInInternationalFormMatch(m, homeTeamId, homeName) &&
        isTeamInInternationalFormMatch(m, awayTeamId, awayName)
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  if (!h2h.length) {
    return { homeWinRate: 1 / 3, drawRate: 1 / 3, awayWinRate: 1 / 3, hasData: false };
  }

  let homeWeight = 0;
  let drawWeight = 0;
  let awayWeight = 0;

  for (let i = 0; i < h2h.length; i++) {
    const m = h2h[i]!;
    const weight = Math.pow(0.88, i);
    const scored = teamGoalsInInternationalForm(m, homeTeamId, homeName);
    if (!scored) continue;

    let outcome: "home" | "draw" | "away";
    if (scored.goalsFor === scored.goalsAgainst) {
      outcome = "draw";
    } else if (scored.goalsFor > scored.goalsAgainst) {
      outcome = "home";
    } else {
      outcome = "away";
    }

    if (outcome === "home") homeWeight += weight;
    else if (outcome === "draw") drawWeight += weight;
    else awayWeight += weight;
  }

  const total = homeWeight + drawWeight + awayWeight;
  if (total <= 0) {
    return { homeWinRate: 1 / 3, drawRate: 1 / 3, awayWinRate: 1 / 3, hasData: false };
  }

  return {
    homeWinRate: homeWeight / total,
    drawRate: drawWeight / total,
    awayWinRate: awayWeight / total,
    hasData: true,
  };
}

export function computeGrahamMomentumIndex(input: {
  homeFormMatches: InternationalFormMatch[];
  awayFormMatches: InternationalFormMatch[];
  homeTeamId: string;
  awayTeamId: string;
  homeName?: string;
  awayName?: string;
}): number {
  const homeForm = computeGrahamXgFormScore(
    input.homeFormMatches,
    input.homeTeamId,
    5,
    input.homeName
  );
  const awayForm = computeGrahamXgFormScore(
    input.awayFormMatches,
    input.awayTeamId,
    5,
    input.awayName
  );
  const combined = [...input.homeFormMatches, ...input.awayFormMatches].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? "")
  );
  const h2h = computeGrahamH2HStrength(
    combined,
    input.homeTeamId,
    input.awayTeamId,
    input.homeName,
    input.awayName
  );

  const raw = (homeForm - awayForm) * GRAHAM_W1_FORM + h2h * GRAHAM_W2_H2H;
  return Math.max(-GRAHAM_MOMENTUM_CLAMP, Math.min(GRAHAM_MOMENTUM_CLAMP, raw));
}

export function applyGrahamMomentumToXg(
  homeXg: number,
  awayXg: number,
  momentum: number
): { homeXg: number; awayXg: number } {
  const mom = Math.max(-GRAHAM_MOMENTUM_CLAMP, Math.min(GRAHAM_MOMENTUM_CLAMP, momentum));
  return {
    homeXg: homeXg * Math.exp(GRAHAM_MOMENTUM_GAMMA * mom),
    awayXg: awayXg * Math.exp(-GRAHAM_MOMENTUM_GAMMA * 0.92 * mom),
  };
}
