import type { TeamStatAverages, WeatherForecast, WeatherImpactResult } from "@/lib/types/prediction";

/** Reference max shots-on-target density for heat penalty normalization. */
export const SOT_CATALOG_MAX = 7;
/** Reference max corners per game for wind penalty normalization. */
export const CORNERS_CATALOG_MAX = 7;
/** 10 m wind speed (km/h) at or above this is treated as match-disrupting. */
export const HIGH_WIND_KPH = 35;

function isHeavyPrecipitation(forecast: WeatherForecast): boolean {
  return forecast.precipMm > 2;
}

function isHighHeatOrHumidity(forecast: WeatherForecast): boolean {
  const temp = forecast.tempC;
  return (typeof temp === "number" && temp > 30) || forecast.humidity > 70;
}

export function isHighWind(forecast: WeatherForecast): boolean {
  return (
    typeof forecast.windKph === "number" &&
    Number.isFinite(forecast.windKph) &&
    forecast.windKph >= HIGH_WIND_KPH
  );
}

function formatTempForNote(tempC: number | undefined): string {
  return typeof tempC === "number" && Number.isFinite(tempC)
    ? `${tempC}°C`
    : "Elevated temperature";
}

function computeRainMultiplier(forecast: WeatherForecast): number {
  return isHeavyPrecipitation(forecast) ? 1.0 - 0.15 : 1.0;
}

function computePhysicalMultiplier(
  teamStats: TeamStatAverages,
  opponentStats: TeamStatAverages,
  forecast: WeatherForecast
): number {
  if (!isHeavyPrecipitation(forecast)) return 1.0;
  const teamPhysical = teamStats.fouls + teamStats.yellowCards;
  const opponentPhysical = opponentStats.fouls + opponentStats.yellowCards;
  return teamPhysical > opponentPhysical ? 1.05 : 1.0;
}

function computeHeatMultiplier(
  teamStats: TeamStatAverages,
  forecast: WeatherForecast
): number {
  if (!isHighHeatOrHumidity(forecast)) return 1.0;
  const sotRatio = teamStats.shotsOnTarget / SOT_CATALOG_MAX;
  return 1.0 - 0.1 * sotRatio;
}

/** Shared conversion drag when wind disrupts passing and ball flight. */
function computeWindBaseMultiplier(forecast: WeatherForecast): number {
  return isHighWind(forecast) ? 1.0 - 0.08 : 1.0;
}

/** Extra drag for sides that rely on crosses and set pieces (corner volume proxy). */
function computeWindStyleMultiplier(
  teamStats: TeamStatAverages,
  forecast: WeatherForecast
): number {
  if (!isHighWind(forecast)) return 1.0;
  const cornerRatio = Math.min(1, teamStats.corners / CORNERS_CATALOG_MAX);
  return 1.0 - 0.08 * cornerRatio;
}

export function computeWeatherImpact(
  forecast: WeatherForecast,
  homeStats: TeamStatAverages,
  awayStats: TeamStatAverages
): WeatherImpactResult {
  const notes: string[] = [];

  const deltaRain = computeRainMultiplier(forecast);
  const deltaPhysicalHome = computePhysicalMultiplier(homeStats, awayStats, forecast);
  const deltaPhysicalAway = computePhysicalMultiplier(awayStats, homeStats, forecast);
  const deltaHeatHome = computeHeatMultiplier(homeStats, forecast);
  const deltaHeatAway = computeHeatMultiplier(awayStats, forecast);
  const deltaWind = computeWindBaseMultiplier(forecast);
  const deltaWindHome = computeWindStyleMultiplier(homeStats, forecast);
  const deltaWindAway = computeWindStyleMultiplier(awayStats, forecast);

  const homeXgMultiplier =
    deltaRain * deltaPhysicalHome * deltaHeatHome * deltaWind * deltaWindHome;
  const awayXgMultiplier =
    deltaRain * deltaPhysicalAway * deltaHeatAway * deltaWind * deltaWindAway;

  const foulsMultiplier = isHeavyPrecipitation(forecast) ? 1.1 : 1.0;
  const cardsMultiplier = foulsMultiplier;

  if (isHeavyPrecipitation(forecast)) {
    notes.push(
      `Heavy precipitation (${forecast.precipMm}mm) reduces conversion rates by 15% (δ_rain = ${deltaRain.toFixed(2)}).`
    );
    if (deltaPhysicalHome > 1) {
      notes.push("Home team physical profile offsets wet-pitch penalty (+5% xG).");
    }
    if (deltaPhysicalAway > 1) {
      notes.push("Away team physical profile offsets wet-pitch penalty (+5% xG).");
    }
    notes.push("Wet conditions increase fouls/cards by 10%.");
  }

  if (isHighHeatOrHumidity(forecast)) {
    const humidity =
      typeof forecast.humidity === "number" && Number.isFinite(forecast.humidity)
        ? `${forecast.humidity}%`
        : "elevated";
    notes.push(
      `High heat/humidity (${formatTempForNote(forecast.tempC)}, ${humidity} humidity) degrades pressing efficiency.`
    );
    if (deltaHeatHome < 1) {
      notes.push(
        `Home pressing penalty: δ_heat = ${deltaHeatHome.toFixed(3)} (SOT density ${homeStats.shotsOnTarget}/${SOT_CATALOG_MAX}).`
      );
    }
    if (deltaHeatAway < 1) {
      notes.push(
        `Away pressing penalty: δ_heat = ${deltaHeatAway.toFixed(3)} (SOT density ${awayStats.shotsOnTarget}/${SOT_CATALOG_MAX}).`
      );
    }
  }

  if (isHighWind(forecast)) {
    notes.push(
      `Strong wind (${forecast.windKph} km/h) reduces open-play conversion by 8% (δ_wind = ${deltaWind.toFixed(2)}).`
    );
    if (deltaWindHome < 1) {
      notes.push(
        `Home wide-play penalty: δ_wind_style = ${(deltaWind * deltaWindHome).toFixed(3)} (corners ${homeStats.corners}/${CORNERS_CATALOG_MAX} per game).`
      );
    }
    if (deltaWindAway < 1) {
      notes.push(
        `Away wide-play penalty: δ_wind_style = ${(deltaWind * deltaWindAway).toFixed(3)} (corners ${awayStats.corners}/${CORNERS_CATALOG_MAX} per game).`
      );
    }
  }

  if (notes.length === 0) {
    const tempSuffix =
      typeof forecast.tempC === "number" && Number.isFinite(forecast.tempC)
        ? `, ${forecast.tempC}°C`
        : "";
    notes.push(
      `Favorable conditions (${forecast.condition}${tempSuffix}) - minimal weather impact.`
    );
  }

  return { homeXgMultiplier, awayXgMultiplier, foulsMultiplier, cardsMultiplier, notes };
}
