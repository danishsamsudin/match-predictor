import type { TeamStatAverages, WeatherForecast, WeatherImpactResult } from "@/lib/types/prediction";

/** Reference max shots-on-target density for heat penalty normalization. */
export const SOT_CATALOG_MAX = 7;

function isHeavyPrecipitation(forecast: WeatherForecast): boolean {
  return forecast.precipMm > 2;
}

function isHighHeatOrHumidity(forecast: WeatherForecast): boolean {
  return forecast.tempC > 30 || forecast.humidity > 70;
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

  const homeXgMultiplier = deltaRain * deltaPhysicalHome * deltaHeatHome;
  const awayXgMultiplier = deltaRain * deltaPhysicalAway * deltaHeatAway;

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
    notes.push(
      `High heat/humidity (${forecast.tempC}°C, ${forecast.humidity}% humidity) degrades pressing efficiency.`
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

  if (notes.length === 0) {
    notes.push(
      `Favorable conditions (${forecast.condition}, ${forecast.tempC}°C) — minimal weather impact.`
    );
  }

  return { homeXgMultiplier, awayXgMultiplier, foulsMultiplier, cardsMultiplier, notes };
}
