import {
  DEFAULT_PLAYER_PROP_ML_COEFFS,
  mergePlayerPropMlCoeffs,
} from "@/lib/prediction/player-props-ml";
import type {
  CorrectScoreCoeffs,
  ExtendedEventCoeffs,
  FormMomentumCoeffs,
  LogisticStackCoeffs,
  MarginModelCoeffs,
  MarketModelsConfig,
  PlayerPropSotCoeffs,
  XgBlendCoeffs,
} from "@/lib/world-cup/market-models/types";

export const DEFAULT_LOGISTIC_STACK: LogisticStackCoeffs = {
  intercept: 0,
  priorWeight: 0.72,
  totalXgSlope: 0.35,
  homeAttackSlope: 0.22,
  awayAttackSlope: 0.22,
  homeDefenseSlope: -0.18,
  awayDefenseSlope: -0.18,
  lowBlockSlope: -0.12,
  rhoSlope: 0.08,
  knockoutSlope: -0.05,
  mlBlend: 0.45,
};

export const DEFAULT_XG_BLEND: XgBlendCoeffs = {
  mlBlend: 0.22,
  intercept: 0,
  grahamPriorWeight: 0.78,
  chanceIndexSlope: 0.12,
  formScoreSlope: 0.18,
  momentumSlope: 0.08,
  lineupImpactSlope: 0.1,
};

export const DEFAULT_FORM_MOMENTUM: FormMomentumCoeffs = {
  intercept: 0,
  recentXgDiffSlope: 0.42,
  h2hSlope: 0.15,
  wcFormSlope: 0.28,
  mlBlend: 0.35,
};

export const DEFAULT_CORRECT_SCORE: CorrectScoreCoeffs = {
  rhoAdjust: 0,
  overdispersionKAdjust: 0,
  top2RerankWeight: 0.15,
};

export const DEFAULT_MARGIN_MODEL: MarginModelCoeffs = {
  intercept: 0,
  xgDiffSlope: 0.55,
  totalXgSlope: 0.08,
  priorBlend: 0.7,
};

export const DEFAULT_PLAYER_PROP_SOT: PlayerPropSotCoeffs = {
  intercept: -0.45,
  logLambdaSlope: 1.1,
  sotRateSlope: 0.55,
  starterSlope: 0.2,
  roleForwardSlope: 0.22,
  teamSotSlope: 0.08,
  mlBlend: 0.5,
  structuralZeroScale: 0.48,
};

export const DEFAULT_EXTENDED_EVENT: ExtendedEventCoeffs = {
  intercept: 0,
  totalXgSlope: 0.35,
  knockoutSlope: 0.1,
  physicalitySlope: 0.25,
  refereeStrictnessSlope: 0.15,
  homeTeamRateSlope: 0.45,
  awayTeamRateSlope: 0.45,
  styleClashSlope: 0.12,
  widePlaySlope: 0.18,
  pressingSlope: 0.1,
};

const OU_LINES = ["0.5", "1.5", "2.5", "3.5"] as const;
const AH_LINES = ["-1.75", "-1.5", "-1.25", "-1", "-0.75", "-0.5", "-0.25", "0", "0.25", "0.5", "0.75", "1", "1.25", "1.5", "1.75"] as const;

function mergeLogisticStack(
  raw: Partial<LogisticStackCoeffs> | undefined,
  fallback: LogisticStackCoeffs
): LogisticStackCoeffs {
  return {
    intercept: Number(raw?.intercept ?? fallback.intercept),
    priorWeight: Number(raw?.priorWeight ?? fallback.priorWeight),
    totalXgSlope: Number(raw?.totalXgSlope ?? fallback.totalXgSlope),
    homeAttackSlope: Number(raw?.homeAttackSlope ?? fallback.homeAttackSlope),
    awayAttackSlope: Number(raw?.awayAttackSlope ?? fallback.awayAttackSlope),
    homeDefenseSlope: Number(raw?.homeDefenseSlope ?? fallback.homeDefenseSlope),
    awayDefenseSlope: Number(raw?.awayDefenseSlope ?? fallback.awayDefenseSlope),
    lowBlockSlope: Number(raw?.lowBlockSlope ?? fallback.lowBlockSlope),
    rhoSlope: Number(raw?.rhoSlope ?? fallback.rhoSlope),
    knockoutSlope: Number(raw?.knockoutSlope ?? fallback.knockoutSlope),
    mlBlend: Number(raw?.mlBlend ?? fallback.mlBlend),
  };
}

function mergeXgBlend(
  raw: Partial<XgBlendCoeffs> | undefined,
  fallback: XgBlendCoeffs
): XgBlendCoeffs {
  return {
    mlBlend: Number(raw?.mlBlend ?? fallback.mlBlend),
    intercept: Number(raw?.intercept ?? fallback.intercept),
    grahamPriorWeight: Number(raw?.grahamPriorWeight ?? fallback.grahamPriorWeight),
    chanceIndexSlope: Number(raw?.chanceIndexSlope ?? fallback.chanceIndexSlope),
    formScoreSlope: Number(raw?.formScoreSlope ?? fallback.formScoreSlope),
    momentumSlope: Number(raw?.momentumSlope ?? fallback.momentumSlope),
    lineupImpactSlope: Number(raw?.lineupImpactSlope ?? fallback.lineupImpactSlope),
  };
}

function mergeFormMomentum(
  raw: Partial<FormMomentumCoeffs> | undefined,
  fallback: FormMomentumCoeffs
): FormMomentumCoeffs {
  return {
    intercept: Number(raw?.intercept ?? fallback.intercept),
    recentXgDiffSlope: Number(raw?.recentXgDiffSlope ?? fallback.recentXgDiffSlope),
    h2hSlope: Number(raw?.h2hSlope ?? fallback.h2hSlope),
    wcFormSlope: Number(raw?.wcFormSlope ?? fallback.wcFormSlope),
    mlBlend: Number(raw?.mlBlend ?? fallback.mlBlend),
  };
}

function mergeExtendedEvent(
  raw: Partial<ExtendedEventCoeffs> | undefined,
  fallback: ExtendedEventCoeffs
): ExtendedEventCoeffs {
  return {
    intercept: Number(raw?.intercept ?? fallback.intercept),
    totalXgSlope: Number(raw?.totalXgSlope ?? fallback.totalXgSlope),
    knockoutSlope: Number(raw?.knockoutSlope ?? fallback.knockoutSlope),
    physicalitySlope: Number(raw?.physicalitySlope ?? fallback.physicalitySlope),
    refereeStrictnessSlope: Number(
      raw?.refereeStrictnessSlope ?? fallback.refereeStrictnessSlope
    ),
    homeTeamRateSlope: Number(raw?.homeTeamRateSlope ?? fallback.homeTeamRateSlope),
    awayTeamRateSlope: Number(raw?.awayTeamRateSlope ?? fallback.awayTeamRateSlope),
    styleClashSlope: Number(raw?.styleClashSlope ?? fallback.styleClashSlope),
    widePlaySlope: Number(raw?.widePlaySlope ?? fallback.widePlaySlope),
    pressingSlope: Number(raw?.pressingSlope ?? fallback.pressingSlope),
  };
}

function mergePlayerPropSot(
  raw: Partial<PlayerPropSotCoeffs> | undefined,
  fallback: PlayerPropSotCoeffs
): PlayerPropSotCoeffs {
  return {
    intercept: Number(raw?.intercept ?? fallback.intercept),
    logLambdaSlope: Number(raw?.logLambdaSlope ?? fallback.logLambdaSlope),
    sotRateSlope: Number(raw?.sotRateSlope ?? fallback.sotRateSlope),
    starterSlope: Number(raw?.starterSlope ?? fallback.starterSlope),
    roleForwardSlope: Number(raw?.roleForwardSlope ?? fallback.roleForwardSlope),
    teamSotSlope: Number(raw?.teamSotSlope ?? fallback.teamSotSlope),
    mlBlend: Number(raw?.mlBlend ?? fallback.mlBlend),
    structuralZeroScale: Number(
      raw?.structuralZeroScale ?? fallback.structuralZeroScale
    ),
  };
}

export function getDefaultMarketModelsConfig(): MarketModelsConfig {
  const overUnder: Record<string, LogisticStackCoeffs> = {};
  for (const line of OU_LINES) {
    overUnder[line] = { ...DEFAULT_LOGISTIC_STACK, totalXgSlope: 0.55 - Number(line) * 0.08 };
  }
  const asianHandicap: Record<string, LogisticStackCoeffs> = {};
  for (const line of AH_LINES) {
    asianHandicap[line] = {
      ...DEFAULT_LOGISTIC_STACK,
      intercept: Number(line) * 0.15,
      totalXgSlope: 0.12,
    };
  }
  return {
    btts: { ...DEFAULT_LOGISTIC_STACK, totalXgSlope: 0.28 },
    overUnder,
    xgHome: { ...DEFAULT_XG_BLEND },
    xgAway: { ...DEFAULT_XG_BLEND },
    formScore: { ...DEFAULT_FORM_MOMENTUM },
    momentum: { ...DEFAULT_FORM_MOMENTUM, wcFormSlope: 0.35 },
    correctScore: { ...DEFAULT_CORRECT_SCORE },
    winningMargin: { ...DEFAULT_MARGIN_MODEL },
    asianHandicap,
    eventStats: {
      corners: {
        ...DEFAULT_EXTENDED_EVENT,
        intercept: Math.log(10.2),
        widePlaySlope: 0.35,
      },
      fouls: {
        ...DEFAULT_EXTENDED_EVENT,
        intercept: Math.log(24.5),
        physicalitySlope: 0.42,
        pressingSlope: 0.22,
      },
      yellow: {
        ...DEFAULT_EXTENDED_EVENT,
        intercept: Math.log(3.8),
        physicalitySlope: 0.38,
        refereeStrictnessSlope: 0.28,
      },
      red: {
        ...DEFAULT_EXTENDED_EVENT,
        intercept: Math.log(0.11),
        physicalitySlope: 0.2,
        refereeStrictnessSlope: 0.18,
      },
    },
    playerProps: {
      anytime: mergePlayerPropMlCoeffs({
        ...DEFAULT_PLAYER_PROP_ML_COEFFS,
        intercept: -0.72,
        structuralZeroScale: 0.42,
        mlBlend: 0.58,
        wcGoalShare: 0.94,
      }),
      goalAssist: mergePlayerPropMlCoeffs({
        ...DEFAULT_PLAYER_PROP_ML_COEFFS,
        intercept: -0.58,
        structuralZeroScale: 0.38,
        mlBlend: 0.52,
        logLambdaSlope: 1.05,
      }),
      sot: { ...DEFAULT_PLAYER_PROP_SOT },
    },
  };
}

export function mergeMarketModelsConfig(
  raw: Partial<MarketModelsConfig> | undefined
): MarketModelsConfig {
  const defaults = getDefaultMarketModelsConfig();
  if (!raw) return defaults;

  const overUnder: Record<string, LogisticStackCoeffs> = { ...defaults.overUnder };
  if (raw.overUnder) {
    for (const [line, coeffs] of Object.entries(raw.overUnder)) {
      overUnder[line] = mergeLogisticStack(coeffs, overUnder[line] ?? DEFAULT_LOGISTIC_STACK);
    }
  }

  const asianHandicap: Record<string, LogisticStackCoeffs> = { ...defaults.asianHandicap };
  if (raw.asianHandicap) {
    for (const [line, coeffs] of Object.entries(raw.asianHandicap)) {
      asianHandicap[line] = mergeLogisticStack(
        coeffs,
        asianHandicap[line] ?? DEFAULT_LOGISTIC_STACK
      );
    }
  }

  return {
    btts: mergeLogisticStack(raw.btts, defaults.btts),
    overUnder,
    xgHome: mergeXgBlend(raw.xgHome, defaults.xgHome),
    xgAway: mergeXgBlend(raw.xgAway, defaults.xgAway),
    formScore: mergeFormMomentum(raw.formScore, defaults.formScore),
    momentum: mergeFormMomentum(raw.momentum, defaults.momentum),
    correctScore: {
      rhoAdjust: Number(raw.correctScore?.rhoAdjust ?? defaults.correctScore.rhoAdjust),
      overdispersionKAdjust: Number(
        raw.correctScore?.overdispersionKAdjust ?? defaults.correctScore.overdispersionKAdjust
      ),
      top2RerankWeight: Number(
        raw.correctScore?.top2RerankWeight ?? defaults.correctScore.top2RerankWeight
      ),
    },
    winningMargin: {
      intercept: Number(raw.winningMargin?.intercept ?? defaults.winningMargin.intercept),
      xgDiffSlope: Number(raw.winningMargin?.xgDiffSlope ?? defaults.winningMargin.xgDiffSlope),
      totalXgSlope: Number(raw.winningMargin?.totalXgSlope ?? defaults.winningMargin.totalXgSlope),
      priorBlend: Number(raw.winningMargin?.priorBlend ?? defaults.winningMargin.priorBlend),
    },
    asianHandicap,
    eventStats: {
      corners: mergeExtendedEvent(raw.eventStats?.corners, defaults.eventStats.corners),
      fouls: mergeExtendedEvent(raw.eventStats?.fouls, defaults.eventStats.fouls),
      yellow: mergeExtendedEvent(raw.eventStats?.yellow, defaults.eventStats.yellow),
      red: mergeExtendedEvent(raw.eventStats?.red, defaults.eventStats.red),
    },
    playerProps: {
      anytime: mergePlayerPropMlCoeffs(
        raw.playerProps?.anytime ?? defaults.playerProps.anytime
      ),
      goalAssist: mergePlayerPropMlCoeffs(
        raw.playerProps?.goalAssist ?? defaults.playerProps.goalAssist
      ),
      sot: mergePlayerPropSot(raw.playerProps?.sot, defaults.playerProps.sot),
    },
  };
}
