/** Nations League Graham model version and ΔS defaults. */
export const NL_GRAHAM_MODEL_VERSION = "nl-graham-v1.1";

/**
 * Target composite weights for ΔS (must sum to 1).
 * Talent starts lower than WC (0.18 vs 0.25): NL has cycle-weighted same-competition
 * history, so WCTR/form carry more. Within a congested window, talent weight still
 * decays via talentDecayPerMatch as in-competition matches arrive (same mechanism as WC).
 */
export const NL_GRAHAM_DELTA_WEIGHTS = {
  xgElo: 0.48,
  talent: 0.18,
  tournament: 0.16,
  recentXgForm: 0.14,
  fifa: 0,
  momentum: 0.04,
} as const;

export const NL_GRAHAM_DELTA_S_CAP = 220;
export const NL_GRAHAM_1X2_TEMPERATURE = 1.15;
export const NL_GRAHAM_MOMENTUM_GAMMA = 0.018;
export const NL_GRAHAM_MOMENTUM_CLAMP = 0.65;
export const NL_GRAHAM_STRENGTH_EXPONENT = 0.0026;
/** Slightly above WC μ: true home/away internationals score a touch more openly than neutral finals. */
export const NL_GRAHAM_MU_XG = 1.28;
export const NL_GRAHAM_XG_ELO_BASE_K = 0.32;
export const NL_GRAHAM_WCTR_BASE_K = 0.55;

/**
 * Within-window talent decay (same spirit as WC). Off across window gaps because
 * matchCount resets when filterMatchesInSameWindow returns empty (e.g. Nov after Oct).
 * Cap 4 ≈ max matches in the Sep–Oct cluster before a long break.
 */
export const NL_TALENT_DECAY_PER_MATCH = 0.04;
export const NL_TALENT_DECAY_MATCH_CAP = 4;
export const NL_TALENT_WEIGHT_FLOOR = 0.4;

/** Lineup blend defaults (higher than WC when coverage is good). */
export const NL_LINEUP_ATTACK_BLEND = 0.4;
export const NL_LINEUP_DEFENSE_BLEND = 0.4;

/** Time decay φ for internationals (days) - same order as WC international φ. */
export const NL_FORM_DECAY_PHI = 0.00048;

/**
 * Competition tier weights for NL form samples.
 * Applied before cycle multiplier.
 */
export function nlCompetitionTierWeight(competition: string | null | undefined): number {
  const c = (competition ?? "").toLowerCase();
  if (!c) return 0.85;
  if (/friendl|preparatory|preparation|test match/.test(c)) return 0.32;
  if (/nations league/.test(c) && /final|play-?off|quarter|semi/.test(c)) return 1.2;
  if (/nations league/.test(c)) return 1.15;
  if (/world cup qualification|wcq|qualif/.test(c) && /europe|uefa/.test(c)) return 1.0;
  if (/euro.*qualif|uefa euro qualification/.test(c)) return 1.0;
  if (/qualif|play-?off|playoff|wcq/.test(c)) return 1.0;
  if (/world cup|euro|copa|continental|afcon|gold cup|asian cup|finals/.test(c)) return 0.9;
  return 0.88;
}

/**
 * Prior NL cycle weights (on top of time decay).
 * 2026/27 current = 1.0; 2024/25 = 0.55; 2022/23 = 0.30; older = 0.15.
 */
export function nlCycleWeight(
  competition: string | null | undefined,
  dateStr: string | null | undefined
): number {
  const c = (competition ?? "").toLowerCase();
  if (!/nations league/.test(c)) return 1;

  const date = (dateStr ?? "").slice(0, 10);
  if (!date) return 0.3;

  // 2026/27 league phase + knockouts into 2027
  if (date >= "2026-09-01" && date <= "2027-06-30") return 1.0;
  // 2024/25 cycle
  if (date >= "2024-09-01" && date <= "2025-06-30") return 0.55;
  // 2022/23 cycle
  if (date >= "2022-06-01" && date <= "2023-06-30") return 0.3;
  // 2020/21 and earlier NL
  if (/nations league/.test(c)) return 0.15;
  return 0.3;
}

export function nlFormSampleWeight(
  competition: string | null | undefined,
  dateStr: string | null | undefined,
  referenceMs = Date.now()
): number {
  const days = (() => {
    if (!dateStr) return 365 * 5;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 365 * 5;
    return Math.max(0, (referenceMs - d.getTime()) / (1000 * 60 * 60 * 24));
  })();
  const decay = Math.exp(-NL_FORM_DECAY_PHI * days);
  return nlCompetitionTierWeight(competition) * decay * nlCycleWeight(competition, dateStr);
}
