import type { TeamStatAverages, WeatherForecast, WeatherImpactResult } from "@/lib/types/prediction";
import { isWetClimateLat } from "@/lib/utils/geo";

function isHeavyRainOrSnow(forecast: WeatherForecast): boolean {
  const condition = forecast.condition.toLowerCase();
  return (
    forecast.precipMm > 2 ||
    condition.includes("rain") ||
    condition.includes("snow") ||
    condition.includes("drizzle") ||
    condition.includes("sleet")
  );
}

function isHighHeatOrHumidity(forecast: WeatherForecast): boolean {
  return forecast.tempC > 30 || forecast.humidity > 70;
}

export function computeWeatherImpact(
  forecast: WeatherForecast,
  homeStats: TeamStatAverages,
  awayStats: TeamStatAverages
): WeatherImpactResult {
  let homeXgMultiplier = 1;
  let awayXgMultiplier = 1;
  let foulsMultiplier = 1;
  let cardsMultiplier = 1;
  const notes: string[] = [];

  if (isHeavyRainOrSnow(forecast)) {
    homeXgMultiplier *= 0.85;
    awayXgMultiplier *= 0.85;
    foulsMultiplier *= 1.1;
    cardsMultiplier *= 1.1;
    notes.push(
      `Heavy rain/snow (${forecast.condition}, ${forecast.precipMm}mm) reduces overall xG by 15% and increases fouls/cards by 10%.`
    );

    const homePhysical = homeStats.fouls + homeStats.yellowCards;
    const awayPhysical = awayStats.fouls + awayStats.yellowCards;
    if (homePhysical > awayPhysical) {
      homeXgMultiplier *= 1.05;
      notes.push("Home team benefits from physical/defensive profile in wet conditions (+5% xG).");
    } else if (awayPhysical > homePhysical) {
      awayXgMultiplier *= 1.05;
      notes.push("Away team benefits from physical/defensive profile in wet conditions (+5% xG).");
    }

    if (forecast.lat !== undefined && isWetClimateLat(forecast.lat)) {
      homeXgMultiplier *= 1.03;
      notes.push("Home team has local climate familiarity with wet conditions (+3% xG).");
    }
  }

  if (isHighHeatOrHumidity(forecast)) {
    notes.push(
      `High heat/humidity (${forecast.tempC}°C, ${forecast.humidity}% humidity) reduces pressing efficiency.`
    );
    const homePressing = homeStats.shotsOnTarget;
    const awayPressing = awayStats.shotsOnTarget;
    if (homePressing > awayPressing) {
      homeXgMultiplier *= 0.9;
      notes.push("Home team (high-intensity press) xG reduced by up to 10% due to heat.");
    } else if (awayPressing > homePressing) {
      awayXgMultiplier *= 0.9;
      notes.push("Away team (high-intensity press) xG reduced by up to 10% due to heat.");
    }
  }

  if (notes.length === 0) {
    notes.push(
      `Favorable conditions (${forecast.condition}, ${forecast.tempC}°C) — minimal weather impact.`
    );
  }

  return { homeXgMultiplier, awayXgMultiplier, foulsMultiplier, cardsMultiplier, notes };
}
