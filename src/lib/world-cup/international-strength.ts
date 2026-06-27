import {
  getFifaEloExpectancy,
  getFifaRankingPoints,
  resolveNationalTeamForStrength,
} from "@/lib/prediction/fifa-team-strength";
import type { TeamStatAverages } from "@/lib/types/prediction";
import {
  confederationStrengthModifier,
  opponentConfederationModifier,
  resolveNationalConfederation,
} from "@/lib/world-cup/confederation-strength";
import type { InternationalFormMatch } from "@/lib/world-cup/load-international-form";
import {
  opponentInInternationalForm,
  resolveInternationalFormTeamSide,
  teamGoalsInInternationalForm,
} from "@/lib/world-cup/international-form-team-side";
import type { WcMatchRow } from "@/lib/world-cup/standings";

const CORNER_XG_BASELINE = 2.7;

/** ~4-year half-life for international result decay (days since match). */
export const INTERNATIONAL_DECAY_PHI = 0.00048;
/** Typical goals per team per match in competitive internationals. */
export const INTERNATIONAL_BASE_GOALS = 1.25;
/** Blend weight for short-window form vs FIFA Elo anchor (0–1 form) on close matchups. */
export const FORM_ELO_BLEND = 0.38;
/** Max log-linear momentum applied to international baseline xG. */
export const INTERNATIONAL_MOMENTUM_GAMMA = 0.042;
export const INTERNATIONAL_MOMENTUM_CLAMP = 0.65;
/** Pseudo-match count pulling extreme attack/defense rates toward league mean (lower ⇒ less shrinkage). */
export const SHRINKAGE_K = 5;
/** Clamp raw attack/defense multipliers before shrinkage. */
export const RATE_CLAMP_MIN = 0.4;
export const RATE_CLAMP_MAX = 2.5;
/** Post-blend xG bounds for internationals (wide — Poisson grid needs contrast). */
export const INTERNATIONAL_XG_FLOOR = 0.1;
export const INTERNATIONAL_XG_CAP = 5;
/**
 * Exponential FIFA scaling: λ = μ·e^(c·ΔR), μ_away = μ·e^(-c·ΔR).
 * c ≈ 0.00255 ⇒ ~2.9× λ per 400 ranking-point gap (avoids Poisson compression at ~1.25).
 */
export const ELO_XG_EXPONENT_SCALE = 0.00305;

export interface InternationalRateSample {
  goalsFor: number;
  goalsAgainst: number;
  effectiveWeight: number;
  matchCount: number;
}

export interface InternationalTeamRates {
  attack: number;
  defense: number;
  sample: InternationalRateSample;
}

export interface InternationalXgPair {
  homeXg: number;
  awayXg: number;
  snapshot: Record<string, unknown>;
}

function daysSince(dateStr: string | null, referenceMs = Date.now()): number {
  if (!dateStr) return 365 * 5;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 365 * 5;
  return Math.max(0, (referenceMs - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function internationalDecayWeight(
  dateStr: string | null,
  referenceMs = Date.now()
): number {
  return Math.exp(-INTERNATIONAL_DECAY_PHI * daysSince(dateStr, referenceMs));
}

/** Down-weight friendlies; up-weight competitive tournaments. */
export function internationalMatchTierWeight(competition: string | null | undefined): number {
  const c = (competition ?? "").toLowerCase();
  if (!c) return 0.85;
  if (/friendl|preparatory|preparation|test match/.test(c)) return 0.32;
  if (/qualif|play-?off|playoff|inter-confederation|wcq|afc|caf|concacaf|conmebol|uefa/.test(c)) {
    return 1;
  }
  if (/world cup|euro|copa|nations league|continental|afcon|gold cup|asian cup|finals/.test(c)) {
    return 1.12;
  }
  return 0.88;
}

function shrinkTowardMean(rate: number, effectiveN: number): number {
  const conf = effectiveN / (effectiveN + SHRINKAGE_K);
  return 1 + (rate - 1) * conf;
}

function clampAttackDefenseRate(rate: number): number {
  return Math.max(RATE_CLAMP_MIN, Math.min(RATE_CLAMP_MAX, rate));
}

export function clampInternationalBaselineXg(xg: number): number {
  return Math.max(INTERNATIONAL_XG_FLOOR, Math.min(INTERNATIONAL_XG_CAP, xg));
}

/**
 * Weighted GF/GA rates from international match history (any competition label).
 */
export function computeInternationalRatesFromMatches(
  teamId: string,
  finishedMatches: InternationalFormMatch[],
  referenceMs = Date.now(),
  teamName?: string
): InternationalTeamRates {
  let gf = 0;
  let ga = 0;
  let w = 0;
  let matchCount = 0;

  for (const m of finishedMatches) {
    if (m.home_goals == null || m.away_goals == null) continue;
    const side = resolveInternationalFormTeamSide(m, teamId, teamName);
    if (!side) continue;

    const tier = internationalMatchTierWeight(m.competition);
    const weight = internationalDecayWeight(m.date, referenceMs) * tier;
    if (weight <= 0) continue;

    const opponent = opponentInInternationalForm(m, teamId, teamName);
    const cOpp = opponentConfederationModifier({
      opponentTeamId: opponent?.id,
      opponentTeamName: opponent?.name,
      competition: m.competition,
    });

    const scored = teamGoalsInInternationalForm(m, teamId, teamName);
    if (!scored) continue;
    gf += scored.goalsFor * weight * cOpp;
    ga += scored.goalsAgainst * weight * cOpp;
    w += weight;
    matchCount += 1;
  }

  const mu = INTERNATIONAL_BASE_GOALS;
  if (w < 0.35) {
    return {
      attack: 1,
      defense: 1,
      sample: { goalsFor: mu, goalsAgainst: mu, effectiveWeight: 0, matchCount },
    };
  }

  const avgGf = gf / w;
  const avgGa = ga / w;
  const rawAttack = avgGf / mu;
  const rawDefense = avgGa / mu;

  return {
    attack: shrinkTowardMean(clampAttackDefenseRate(rawAttack), w),
    defense: shrinkTowardMean(clampAttackDefenseRate(rawDefense), w),
    sample: { goalsFor: avgGf, goalsAgainst: avgGa, effectiveWeight: w, matchCount },
  };
}

export function resolveFifaRatingDelta(
  homeTeamId: number,
  awayTeamId: number,
  homeName?: string,
  awayName?: string
): number {
  return fifaAnchoredXg(homeTeamId, awayTeamId, homeName, awayName, INTERNATIONAL_BASE_GOALS)
    .ratingDelta;
}

function fifaAnchoredXg(
  homeTeamId: number,
  awayTeamId: number,
  homeName: string | undefined,
  awayName: string | undefined,
  mu: number
): {
  homeXg: number;
  awayXg: number;
  homePts: number;
  awayPts: number;
  eloHomeWin: number;
  ratingDelta: number;
} {
  const homeResolved = resolveNationalTeamForStrength(homeTeamId, homeName);
  const awayResolved = resolveNationalTeamForStrength(awayTeamId, awayName);
  const homePts = getFifaRankingPoints(homeResolved.teamId, homeResolved.teamName) ?? 1400;
  const awayPts = getFifaRankingPoints(awayResolved.teamId, awayResolved.teamName) ?? 1400;
  const eloHomeWin = getFifaEloExpectancy(homePts, awayPts);
  const ratingDelta = homePts - awayPts;
  const expShift = ELO_XG_EXPONENT_SCALE * ratingDelta;
  return {
    homeXg: clampInternationalBaselineXg(mu * Math.exp(expShift)),
    awayXg: clampInternationalBaselineXg(mu * Math.exp(-expShift)),
    homePts,
    awayPts,
    eloHomeWin,
    ratingDelta,
  };
}

/** More FIFA weight when ranking gap is large; form dominates only for tight matchups. */
export function resolveFormEloBlendWeight(fifaRatingDelta: number): number {
  const gap = Math.abs(fifaRatingDelta);
  if (gap <= 50) return FORM_ELO_BLEND;
  return Math.min(0.96, FORM_ELO_BLEND + (gap - 50) / 300);
}

/**
 * When FIFA gap is large, cap how far short-window form can pull xG off the Elo anchor.
 */
export function constrainFormDeviationFromElo(
  homeXg: number,
  awayXg: number,
  eloHome: number,
  eloAway: number,
  fifaRatingDelta: number
): { homeXg: number; awayXg: number } {
  const gap = Math.abs(fifaRatingDelta);
  if (gap <= 80) {
    return {
      homeXg: clampInternationalBaselineXg(homeXg),
      awayXg: clampInternationalBaselineXg(awayXg),
    };
  }
  const keep = Math.max(0.22, 0.68 - gap / 520);
  return {
    homeXg: clampInternationalBaselineXg(eloHome + (homeXg - eloHome) * keep),
    awayXg: clampInternationalBaselineXg(eloAway + (awayXg - eloAway) * keep),
  };
}

function blendFormAndElo(
  formHome: number,
  formAway: number,
  eloHome: number,
  eloAway: number,
  eloWeight: number
): { homeXg: number; awayXg: number } {
  const w = 1 - eloWeight;
  return {
    homeXg: clampInternationalBaselineXg(w * formHome + eloWeight * eloHome),
    awayXg: clampInternationalBaselineXg(w * formAway + eloWeight * eloAway),
  };
}

/**
 * Poisson λ/μ from blended form + FIFA anchor before venue/motivation shocks.
 */
export function resolveInternationalExpectedGoals(input: {
  homeTeamId: number;
  awayTeamId: number;
  homeName?: string;
  awayName?: string;
  homeRates: InternationalTeamRates;
  awayRates: InternationalTeamRates;
  mu?: number;
}): InternationalXgPair {
  const mu = input.mu ?? INTERNATIONAL_BASE_GOALS;
  const formHome = mu * input.homeRates.attack * input.awayRates.defense;
  const formAway = mu * input.awayRates.attack * input.homeRates.defense;
  const elo = fifaAnchoredXg(
    input.homeTeamId,
    input.awayTeamId,
    input.homeName,
    input.awayName,
    mu
  );
  const eloWeight = resolveFormEloBlendWeight(elo.ratingDelta);
  const blended = blendFormAndElo(formHome, formAway, elo.homeXg, elo.awayXg, eloWeight);
  const constrained = constrainFormDeviationFromElo(
    blended.homeXg,
    blended.awayXg,
    elo.homeXg,
    elo.awayXg,
    elo.ratingDelta
  );

  return {
    homeXg: constrained.homeXg,
    awayXg: constrained.awayXg,
    snapshot: {
      mu,
      form_home_xg: Math.round(formHome * 1000) / 1000,
      form_away_xg: Math.round(formAway * 1000) / 1000,
      elo_home_xg: Math.round(elo.homeXg * 1000) / 1000,
      elo_away_xg: Math.round(elo.awayXg * 1000) / 1000,
      fifa_home_pts: elo.homePts,
      fifa_away_pts: elo.awayPts,
      elo_home_win: elo.eloHomeWin,
      fifa_rating_delta: elo.ratingDelta,
      elo_xg_exponent_scale: ELO_XG_EXPONENT_SCALE,
      form_elo_blend: FORM_ELO_BLEND,
      form_elo_blend_effective: Math.round(eloWeight * 1000) / 1000,
      home_attack: input.homeRates.attack,
      home_defense: input.homeRates.defense,
      away_attack: input.awayRates.attack,
      away_defense: input.awayRates.defense,
      home_sample_weight: input.homeRates.sample.effectiveWeight,
      away_sample_weight: input.awayRates.sample.effectiveWeight,
    },
  };
}

/**
 * Dixon-Coles ρ for internationals. Balanced ties keep mild negative ρ (draw mass);
 * lopsided gaps (xG or FIFA) use positive ρ so 0-0 / 1-1 cells do not dominate the heatmap.
 */
export function resolveInternationalScoreCorrelation(
  homeXg: number,
  awayXg: number,
  fifaRatingDelta?: number
): number {
  const xgDiff = Math.abs(homeXg - awayXg);
  const impliedFromFifa =
    fifaRatingDelta != null ? Math.abs(fifaRatingDelta) / 280 : 0;
  const effectiveDiff = Math.max(xgDiff, impliedFromFifa);

  if (effectiveDiff >= 1.25) return 0;
  if (effectiveDiff >= 0.75) return -0.04;
  if (effectiveDiff >= 0.28) return 0.02;
  const total = homeXg + awayXg;
  if (total >= 3.1) return -0.08;
  if (total >= 2.4) return -0.11;
  return -0.14;
}

/**
 * After lineup / venue shocks, pull λ/μ back toward the FIFA anchor when ranking gap is large.
 */
export function pullInternationalXgTowardFifaAnchor(
  homeXg: number,
  awayXg: number,
  input: {
    homeTeamId: number;
    awayTeamId: number;
    homeName?: string;
    awayName?: string;
    mu?: number;
    /** Weaken FIFA pull when rotation / low-stakes (0–1, default 1). */
    anchorPullScale?: number;
  }
): { homeXg: number; awayXg: number; fifaRatingDelta: number } {
  const mu = input.mu ?? INTERNATIONAL_BASE_GOALS;
  const elo = fifaAnchoredXg(
    input.homeTeamId,
    input.awayTeamId,
    input.homeName,
    input.awayName,
    mu
  );
  const gap = Math.abs(elo.ratingDelta);
  if (gap <= 90) {
    return { homeXg, awayXg, fifaRatingDelta: elo.ratingDelta };
  }

  const pullScale = Math.max(0, Math.min(1, input.anchorPullScale ?? 1));
  const pull = Math.min(0.72, (gap - 90) / 180) * pullScale;
  return {
    homeXg: clampInternationalBaselineXg(homeXg * (1 - pull) + elo.homeXg * pull),
    awayXg: clampInternationalBaselineXg(awayXg * (1 - pull) + elo.awayXg * pull),
    fifaRatingDelta: elo.ratingDelta,
  };
}

export function wcHubRatesFromHistory(
  teamId: string,
  formMatches: InternationalFormMatch[] | WcMatchRow[],
  teamName?: string
): InternationalTeamRates {
  return computeInternationalRatesFromMatches(teamId, formMatches, Date.now(), teamName);
}

/** Pull extreme short-window GF/GA toward international mean (friendlies noise). */
export function regressInternationalSeasonRate(observed: number, mu: number): number {
  const shrink = 0.38;
  return observed * (1 - shrink) + mu * shrink;
}

function statsToRates(
  stats: TeamStatAverages,
  mu: number,
  teamId?: number,
  teamName?: string
): InternationalTeamRates {
  const confedMod = confederationStrengthModifier(
    resolveNationalConfederation(teamId, teamName)
  );
  const gf = regressInternationalSeasonRate(stats.goalsFor * confedMod, mu);
  const ga = regressInternationalSeasonRate(stats.goalsAgainst / confedMod, mu);
  return {
    attack: clampAttackDefenseRate(gf / mu),
    defense: clampAttackDefenseRate(ga / mu),
    sample: {
      goalsFor: gf,
      goalsAgainst: ga,
      effectiveWeight: 8,
      matchCount: 8,
    },
  };
}

/**
 * National-team baseline xG: FIFA/form anchor (primary) + small capped momentum nudge.
 * Uses raw per-game stats (not Ω-benchmarked) so weaker sides are not crushed to ~0.3 xG.
 */
export function buildInternationalBaselineXg(input: {
  mu: number;
  homeTeamId: number;
  awayTeamId: number;
  homeName?: string;
  awayName?: string;
  homeStats: TeamStatAverages;
  awayStats: TeamStatAverages;
  momentumIndex?: number;
}): {
  homeXg: number;
  awayXg: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
} {
  const { mu, homeStats, awayStats } = input;
  const anchored = resolveInternationalExpectedGoals({
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeName: input.homeName,
    awayName: input.awayName,
    homeRates: statsToRates(homeStats, mu, input.homeTeamId, input.homeName),
    awayRates: statsToRates(awayStats, mu, input.awayTeamId, input.awayName),
    mu,
  });

  const structuralHome = (homeStats.goalsFor / mu) * (awayStats.goalsAgainst / mu) * mu;
  const structuralAway = (awayStats.goalsFor / mu) * (homeStats.goalsAgainst / mu) * mu;

  const eloBlend =
    (anchored.snapshot.form_elo_blend_effective as number | undefined) ?? FORM_ELO_BLEND;
  const structuralWeight = 0.12 * (1 - Math.min(0.88, eloBlend));
  const anchoredWeight = 1 - structuralWeight;

  let homeXg = anchoredWeight * anchored.homeXg + structuralWeight * structuralHome;
  let awayXg = anchoredWeight * anchored.awayXg + structuralWeight * structuralAway;

  const mom = Math.max(
    -INTERNATIONAL_MOMENTUM_CLAMP,
    Math.min(INTERNATIONAL_MOMENTUM_CLAMP, input.momentumIndex ?? 0)
  );
  homeXg *= Math.exp(INTERNATIONAL_MOMENTUM_GAMMA * mom);
  awayXg *= Math.exp(-INTERNATIONAL_MOMENTUM_GAMMA * 0.92 * mom);

  const totalMatchXg = homeXg + awayXg;
  const corners =
    (homeStats.corners + awayStats.corners) *
    Math.exp(0.02 * (totalMatchXg - CORNER_XG_BASELINE));

  return {
    homeXg,
    awayXg,
    corners,
    fouls: homeStats.fouls + awayStats.fouls,
    yellowCards: homeStats.yellowCards + awayStats.yellowCards,
    redCards: homeStats.redCards + awayStats.redCards,
  };
}
