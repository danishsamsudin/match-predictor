/** Graham WC hub model version. */
export const GRAHAM_MODEL_VERSION = "wc-graham-v1.0";

/** Target composite weights for ΔS (must sum to 1). */
export const GRAHAM_DELTA_WEIGHTS = {
  xgElo: 0.4,
  talent: 0.2,
  tournament: 0.15,
  recentXgForm: 0.1,
  fifa: 0.1,
  momentum: 0.05,
} as const;

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

/** Squad talent blend: Transfermarkt vs Scoutlyst. */
export const GRAHAM_TALENT_TM_WEIGHT = 0.6;
export const GRAHAM_TALENT_SCOUTLYST_WEIGHT = 0.4;

/** Exponential anchor scale (same order as FIFA xG mapping). */
export const GRAHAM_STRENGTH_EXPONENT = 0.00305;

export const GRAHAM_MU_XG = 1.25;
