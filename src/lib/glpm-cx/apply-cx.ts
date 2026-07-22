/**
 * GLPM Contextual Extension (GLPM-CX) multipliers.
 * Copied formulas conceptually from GLPM engine/context.ts but owned by CX
 * so frozen GLPM predict path is never wired to these features.
 */

export const CX_MODEL_VERSION = "glpm_cx_v1";

export type CxContextConfig = {
  restBaselineDays: number;
  congestionDays: number;
  congestionPenalty: number;
  travelLongKm: number;
  travelModerateKm: number;
  travelLongMult: number;
  travelModerateMult: number;
  altitudeThresholdM: number;
  altitudeAwayPenalty: number;
  weatherHeavyRainMult: number;
  weatherHighWindMult: number;
  xgFloor: number;
  xgCeiling: number;
};

export const DEFAULT_CX_CONTEXT_CONFIG: CxContextConfig = {
  restBaselineDays: 7,
  congestionDays: 4,
  congestionPenalty: 0.97,
  travelLongKm: 1500,
  travelModerateKm: 500,
  travelLongMult: 0.95,
  travelModerateMult: 0.98,
  altitudeThresholdM: 1000,
  altitudeAwayPenalty: 0.97,
  weatherHeavyRainMult: 0.96,
  weatherHighWindMult: 0.97,
  xgFloor: 0.15,
  xgCeiling: 4.5,
};

export function cxRestDaysMultiplier(
  restDays: number,
  config: CxContextConfig = DEFAULT_CX_CONTEXT_CONFIG
): number {
  const days = Number.isFinite(restDays) ? restDays : config.restBaselineDays;
  let base: number;
  if (days >= 3) base = 1;
  else if (days <= 0) base = 0.85;
  else base = 1 - (3 - days) / 10;

  if (days <= config.congestionDays) {
    base *= config.congestionPenalty;
  }
  return Math.max(0.82, Math.min(1, base));
}

export function cxTravelMultiplier(
  distanceKm: number,
  config: CxContextConfig = DEFAULT_CX_CONTEXT_CONFIG
): number {
  const d = Number.isFinite(distanceKm) ? distanceKm : 0;
  if (d > config.travelLongKm) return config.travelLongMult;
  if (d > config.travelModerateKm) return config.travelModerateMult;
  return 1;
}

export function cxAltitudeMultipliers(
  altitudeM: number | null | undefined,
  config: CxContextConfig = DEFAULT_CX_CONTEXT_CONFIG
): { home: number; away: number } {
  if (altitudeM == null || !Number.isFinite(altitudeM)) return { home: 1, away: 1 };
  if (!(altitudeM > config.altitudeThresholdM)) return { home: 1, away: 1 };
  return { home: 1, away: config.altitudeAwayPenalty };
}

export type CxWeatherInput = {
  precipitationMm?: number | null;
  windSpeedKph?: number | null;
};

export function cxWeatherMultiplier(
  weather: CxWeatherInput | null | undefined,
  config: CxContextConfig = DEFAULT_CX_CONTEXT_CONFIG
): number {
  if (!weather) return 1;
  let m = 1;
  const rain = weather.precipitationMm ?? 0;
  const wind = weather.windSpeedKph ?? 0;
  if (rain >= 5) m *= config.weatherHeavyRainMult;
  if (wind >= 40) m *= config.weatherHighWindMult;
  return m;
}

export type CxSideFeatures = {
  restDays: number | null;
  travelKm: number | null;
  restMult: number;
  travelMult: number;
  altitudeMult: number;
  weatherMult: number;
  lineupMult: number;
};

export type CxApplyResult = {
  homeXg: number;
  awayXg: number;
  home: CxSideFeatures & { combinedMult: number; baseXg: number; steps: Array<{ name: string; value: number }> };
  away: CxSideFeatures & { combinedMult: number; baseXg: number; steps: Array<{ name: string; value: number }> };
  modelVersion: string;
};

function clampXg(v: number, config: CxContextConfig): number {
  return Math.max(config.xgFloor, Math.min(config.xgCeiling, v));
}

export function applyCxToXg(args: {
  homeXg: number;
  awayXg: number;
  home: Omit<CxSideFeatures, "restMult" | "travelMult" | "altitudeMult" | "weatherMult"> & {
    restMult?: number;
    travelMult?: number;
    altitudeMult?: number;
    weatherMult?: number;
  };
  away: Omit<CxSideFeatures, "restMult" | "travelMult" | "altitudeMult" | "weatherMult"> & {
    restMult?: number;
    travelMult?: number;
    altitudeMult?: number;
    weatherMult?: number;
  };
  config?: CxContextConfig;
}): CxApplyResult {
  const config = args.config ?? DEFAULT_CX_CONTEXT_CONFIG;

  const homeRest = args.home.restMult ?? cxRestDaysMultiplier(args.home.restDays ?? config.restBaselineDays, config);
  const awayRest = args.away.restMult ?? cxRestDaysMultiplier(args.away.restDays ?? config.restBaselineDays, config);
  const homeTravel = args.home.travelMult ?? cxTravelMultiplier(args.home.travelKm ?? 0, config);
  const awayTravel = args.away.travelMult ?? cxTravelMultiplier(args.away.travelKm ?? 0, config);
  const homeAlt = args.home.altitudeMult ?? 1;
  const awayAlt = args.away.altitudeMult ?? 1;
  const homeWeather = args.home.weatherMult ?? 1;
  const awayWeather = args.away.weatherMult ?? 1;
  const homeLineup = args.home.lineupMult ?? 1;
  const awayLineup = args.away.lineupMult ?? 1;

  const homeCombined = homeRest * homeTravel * homeAlt * homeWeather * homeLineup;
  const awayCombined = awayRest * awayTravel * awayAlt * awayWeather * awayLineup;

  const homeXg = clampXg(args.homeXg * homeCombined, config);
  const awayXg = clampXg(args.awayXg * awayCombined, config);

  const buildSteps = (
    base: number,
    rest: number,
    travel: number,
    alt: number,
    weather: number,
    lineup: number,
    final: number
  ) => [
    { name: "GLPM base", value: base },
    { name: "× Rest", value: rest },
    { name: "× Travel", value: travel },
    { name: "× Altitude", value: alt },
    { name: "× Weather", value: weather },
    { name: "× Lineup", value: lineup },
    { name: "CX xG", value: final },
  ];

  return {
    homeXg,
    awayXg,
    modelVersion: CX_MODEL_VERSION,
    home: {
      restDays: args.home.restDays,
      travelKm: args.home.travelKm,
      restMult: homeRest,
      travelMult: homeTravel,
      altitudeMult: homeAlt,
      weatherMult: homeWeather,
      lineupMult: homeLineup,
      combinedMult: homeCombined,
      baseXg: args.homeXg,
      steps: buildSteps(args.homeXg, homeRest, homeTravel, homeAlt, homeWeather, homeLineup, homeXg),
    },
    away: {
      restDays: args.away.restDays,
      travelKm: args.away.travelKm,
      restMult: awayRest,
      travelMult: awayTravel,
      altitudeMult: awayAlt,
      weatherMult: awayWeather,
      lineupMult: awayLineup,
      combinedMult: awayCombined,
      baseXg: args.awayXg,
      steps: buildSteps(args.awayXg, awayRest, awayTravel, awayAlt, awayWeather, awayLineup, awayXg),
    },
  };
}
