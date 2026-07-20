/**
 * GLPM engine public API (Chapters 11–12).
 */

export {
  defaultXgEngineConfig,
  DEFAULT_HOME_ADVANTAGE,
  DEFAULT_INTERACTION_WEIGHTS,
  DEFAULT_MU_XG,
  XG_MODEL_VERSION,
  type XgEngineConfig,
} from "./config";
export {
  homeAdvantageMultiplier,
  resolveContextMultipliers,
  restDaysMultiplier,
  travelMultiplier,
  venueAltitudeMultipliers,
} from "./context";
export {
  computeInteractionMatrix,
  ratingToZ,
  resolveRating,
  type InteractionMatrixResult,
  type SideInteractions,
} from "./interactions";
export {
  buildScoreMatrix,
  defaultPredictionConfig,
  derive1x2,
  deriveBtts,
  deriveOverUnder,
  dixonColesTau,
  predictMatch,
  PRED_MODEL_VERSION,
  scoreProbability,
  toPredictionHistoryRow,
  type GlpmPredictionResult,
  type PredictionConfig,
} from "./predictions";
export {
  PRIMARY_LABELS,
  PRIMARY_ORDER,
  type MatchContext,
  type PrimaryKey,
  type RatingVectorInput,
  type XgEngineResult,
} from "./types";
export { baselineXgFromDeltaS, estimateExpectedGoals } from "./xg";
