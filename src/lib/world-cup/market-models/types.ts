import type { PlayerPropMlCoeffs } from "@/lib/prediction/player-props-ml";

/** All platform prediction surfaces tracked by the market-model registry. */
export type MarketModelId =
  | "win_probability"
  | "team_comparison"
  | "player_props_anytime"
  | "player_props_goal_assist"
  | "player_props_sot"
  | "correct_score"
  | "winning_margin"
  | "asian_handicap"
  | "goals_over_under"
  | "btts"
  | "expected_goals"
  | "form_momentum"
  | "event_stats";

export const ALL_MARKET_MODEL_IDS: MarketModelId[] = [
  "win_probability",
  "team_comparison",
  "player_props_anytime",
  "player_props_goal_assist",
  "player_props_sot",
  "correct_score",
  "winning_margin",
  "asian_handicap",
  "goals_over_under",
  "btts",
  "expected_goals",
  "form_momentum",
  "event_stats",
];

/** Logistic stack: blend structural prior with ML logit. */
export interface LogisticStackCoeffs {
  intercept: number;
  priorWeight: number;
  totalXgSlope: number;
  homeAttackSlope: number;
  awayAttackSlope: number;
  homeDefenseSlope: number;
  awayDefenseSlope: number;
  lowBlockSlope: number;
  rhoSlope: number;
  knockoutSlope: number;
  mlBlend: number;
}

export interface PlayerPropSotCoeffs {
  intercept: number;
  logLambdaSlope: number;
  sotRateSlope: number;
  starterSlope: number;
  roleForwardSlope: number;
  teamSotSlope: number;
  mlBlend: number;
  structuralZeroScale: number;
}

export interface XgBlendCoeffs {
  mlBlend: number;
  intercept: number;
  grahamPriorWeight: number;
  chanceIndexSlope: number;
  formScoreSlope: number;
  momentumSlope: number;
  lineupImpactSlope: number;
}

export interface FormMomentumCoeffs {
  intercept: number;
  recentXgDiffSlope: number;
  h2hSlope: number;
  wcFormSlope: number;
  mlBlend: number;
}

export interface CorrectScoreCoeffs {
  rhoAdjust: number;
  overdispersionKAdjust: number;
  top2RerankWeight: number;
}

export interface MarginModelCoeffs {
  intercept: number;
  xgDiffSlope: number;
  totalXgSlope: number;
  priorBlend: number;
}

export interface ExtendedEventCoeffs {
  intercept: number;
  totalXgSlope: number;
  knockoutSlope: number;
  physicalitySlope: number;
  refereeStrictnessSlope: number;
  homeTeamRateSlope: number;
  awayTeamRateSlope: number;
  styleClashSlope: number;
  widePlaySlope: number;
  pressingSlope: number;
}

export interface MarketModelsConfig {
  btts: LogisticStackCoeffs;
  overUnder: Record<string, LogisticStackCoeffs>;
  xgHome: XgBlendCoeffs;
  xgAway: XgBlendCoeffs;
  formScore: FormMomentumCoeffs;
  momentum: FormMomentumCoeffs;
  correctScore: CorrectScoreCoeffs;
  winningMargin: MarginModelCoeffs;
  asianHandicap: Record<string, LogisticStackCoeffs>;
  eventStats: {
    corners: ExtendedEventCoeffs;
    fouls: ExtendedEventCoeffs;
    yellow: ExtendedEventCoeffs;
    red: ExtendedEventCoeffs;
  };
  playerProps: {
    anytime: PlayerPropMlCoeffs;
    goalAssist: PlayerPropMlCoeffs;
    sot: PlayerPropSotCoeffs;
  };
}

export interface MarketEvaluationRow {
  matchId: string;
  marketId: MarketModelId;
  predicted: Record<string, unknown>;
  actual: Record<string, unknown>;
  lossMetric: string;
  lossValue: number;
  modelVersion: string;
}

export interface MarketStackFeatures {
  totalXg: number;
  homeXg: number;
  awayXg: number;
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  lowBlockIndex: number;
  rho: number;
  isKnockout: boolean;
  homeScoringRate: number;
  awayScoringRate: number;
  homeCleanSheetRate: number;
  awayCleanSheetRate: number;
  finishingRegressionDiff: number;
  physicalityIndex: number;
}
