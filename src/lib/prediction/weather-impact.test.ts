import { describe, expect, it } from "vitest";
import {
  CORNERS_CATALOG_MAX,
  HIGH_WIND_KPH,
  computeWeatherImpact,
  isHighWind,
} from "./weather-impact";
import type { TeamStatAverages, WeatherForecast } from "@/lib/types/prediction";

const baseStats: TeamStatAverages = {
  goalsFor: 1.5,
  goalsAgainst: 1.0,
  corners: 5,
  fouls: 11,
  yellowCards: 2,
  redCards: 0.1,
  shotsOnTarget: 4,
};

const calmForecast: WeatherForecast = {
  condition: "Clear",
  tempC: 18,
  humidity: 50,
  windKph: 12,
  precipMm: 0,
};

describe("isHighWind", () => {
  it("is false below threshold", () => {
    expect(isHighWind({ ...calmForecast, windKph: HIGH_WIND_KPH - 1 })).toBe(false);
  });

  it("is true at and above threshold", () => {
    expect(isHighWind({ ...calmForecast, windKph: HIGH_WIND_KPH })).toBe(true);
    expect(isHighWind({ ...calmForecast, windKph: 50 })).toBe(true);
  });
});

describe("computeWeatherImpact wind", () => {
  it("leaves multipliers at 1 when wind is calm", () => {
    const result = computeWeatherImpact(calmForecast, baseStats, baseStats);
    expect(result.homeXgMultiplier).toBe(1);
    expect(result.awayXgMultiplier).toBe(1);
    expect(result.notes.some((n) => n.includes("wind"))).toBe(false);
  });

  it("applies base wind drag plus style penalty from corners", () => {
    const windy: WeatherForecast = { ...calmForecast, windKph: 40 };
    const lowCorner = { ...baseStats, corners: 3 };
    const windStyle = 1 - 0.08 * (3 / CORNERS_CATALOG_MAX);
    const expected = 0.92 * windStyle;
    const result = computeWeatherImpact(windy, lowCorner, lowCorner);
    expect(result.homeXgMultiplier).toBeCloseTo(expected, 5);
    expect(result.awayXgMultiplier).toBeCloseTo(expected, 5);
  });

  it("adds extra drag for high-corner sides", () => {
    const windy: WeatherForecast = { ...calmForecast, windKph: 45 };
    const aerial = { ...baseStats, corners: CORNERS_CATALOG_MAX };
    const result = computeWeatherImpact(windy, aerial, baseStats);
    const expectedHome = 0.92 * (1 - 0.08);
    const expectedAway = 0.92 * (1 - 0.08 * (baseStats.corners / CORNERS_CATALOG_MAX));
    expect(result.homeXgMultiplier).toBeCloseTo(expectedHome, 5);
    expect(result.awayXgMultiplier).toBeCloseTo(expectedAway, 5);
    expect(result.notes.some((n) => n.includes("Strong wind"))).toBe(true);
  });

  it("stacks wind with heavy rain", () => {
    const wetWindy: WeatherForecast = {
      ...calmForecast,
      precipMm: 5,
      windKph: 40,
    };
    const result = computeWeatherImpact(wetWindy, baseStats, baseStats);
    const rain = 0.85;
    const wind = 0.92;
    const windStyle = 1 - 0.08 * (baseStats.corners / CORNERS_CATALOG_MAX);
    expect(result.homeXgMultiplier).toBeCloseTo(rain * wind * windStyle, 5);
  });
});
