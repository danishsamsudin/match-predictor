/** Graham WC hub model version. */
export const GRAHAM_MODEL_VERSION = "wc-graham-v1.1";

/** Target composite weights for ΔS (must sum to 1). FIFA folded into xG-Elo init. */
export const GRAHAM_DELTA_WEIGHTS = {
  xgElo: 0.5,
  talent: 0.25,
  tournament: 0.125,
  recentXgForm: 0.1,
  fifa: 0,
  momentum: 0.025,
} as const;

/** Cap on strength index before exponentiation (limits overconfident λ). */
export const GRAHAM_DELTA_S_CAP = 220;

/** Temperature on raw Poisson 1X2 before persisting (τ > 1 raises draw/underdog mass). */
export const GRAHAM_1X2_TEMPERATURE = 1.2;

/** Reduced momentum vs legacy international model. */
export const GRAHAM_MOMENTUM_GAMMA = 0.015;
export const GRAHAM_MOMENTUM_CLAMP = 0.65;
export const GRAHAM_W1_FORM = 0.55;
export const GRAHAM_W2_H2H = 0.1;

/** Shot quality profile nudges on attack/defense rates. */
export const GRAHAM_SCI_WEIGHT = 0.08;
export const GRAHAM_SSI_WEIGHT = 0.08;

/** xG-Elo update scale (higher τ ⇒ larger K). */
export const GRAHAM_XG_ELO_BASE_K = 0.32;

/** WCTR update scale — higher than xG-Elo because fewer tournament-only matches. */
export const GRAHAM_WCTR_BASE_K = 0.55;

/** Squad talent blend: Transfermarkt vs Scoutlyst. */
export const GRAHAM_TALENT_TM_WEIGHT = 0.6;
export const GRAHAM_TALENT_SCOUTLYST_WEIGHT = 0.4;

/** Exponential anchor scale (lower after deduping correlated ΔS features). */
export const GRAHAM_STRENGTH_EXPONENT = 0.0026;

export const GRAHAM_MU_XG = 1.25;
