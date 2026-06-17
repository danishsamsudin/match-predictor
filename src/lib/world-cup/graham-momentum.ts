import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  GRAHAM_MOMENTUM_CLAMP,
  GRAHAM_MOMENTUM_GAMMA,
  GRAHAM_W1_FORM,
  GRAHAM_W2_H2H,
} from "@/lib/world-cup/graham-model-config";

/** Same recency decay as form-momentum.ts (most recent first). */
const FORM_RECENCY_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1];

const XG_DIFF_SCALE = 2.4;

function teamXgDiff(m: InternationalFormMatch, teamId: string): number | null {
  const isHome = m.home_team_id === teamId;
  const isAway = m.away_team_id === teamId;
  if (!isHome && !isAway) return null;

  const xgf = (isHome ? m.home_xg : m.away_xg) ?? (isHome ? m.home_goals : m.away_goals);
  const xga = (isHome ? m.away_xg : m.home_xg) ?? (isHome ? m.away_goals : m.home_goals);
  if (xgf == null || xga == null) return null;
  return xgf - xga;
}

export function computeGrahamXgFormScore(
  matches: InternationalFormMatch[],
  teamId: string,
  maxMatches = 5
): number {
  const recent = matches.slice(0, maxMatches);
  if (!recent.length) return 0.5;

  let weighted = 0;
  let weightSum = 0;
  for (let i = 0; i < recent.length; i++) {
    const diff = teamXgDiff(recent[i], teamId);
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
  awayTeamId: string
): number {
  const h2h = matches.filter(
    (m) =>
      (m.home_team_id === homeTeamId && m.away_team_id === awayTeamId) ||
      (m.home_team_id === awayTeamId && m.away_team_id === homeTeamId)
  );
  if (!h2h.length) return 0;

  let homeEdge = 0;
  let w = 0;
  for (let i = 0; i < h2h.length; i++) {
    const diff = teamXgDiff(h2h[i], homeTeamId);
    if (diff == null) continue;
    const weight = Math.pow(0.88, i);
    homeEdge += (diff / XG_DIFF_SCALE) * weight;
    w += weight;
  }
  if (w <= 0) return 0;
  return Math.max(-1, Math.min(1, homeEdge / w));
}

export function computeGrahamMomentumIndex(input: {
  homeFormMatches: InternationalFormMatch[];
  awayFormMatches: InternationalFormMatch[];
  homeTeamId: string;
  awayTeamId: string;
}): number {
  const homeForm = computeGrahamXgFormScore(input.homeFormMatches, input.homeTeamId);
  const awayForm = computeGrahamXgFormScore(input.awayFormMatches, input.awayTeamId);
  const combined = [...input.homeFormMatches, ...input.awayFormMatches].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? "")
  );
  const h2h = computeGrahamH2HStrength(combined, input.homeTeamId, input.awayTeamId);

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
