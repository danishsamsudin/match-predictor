import { describe, expect, it } from "vitest";
import { buildFallbackWeatherForecast } from "@/lib/api/weather";

describe("buildFallbackWeatherForecast", () => {
  it("uses known host-city coordinates when Open-Meteo is unavailable", () => {
    const forecast = buildFallbackWeatherForecast("Houston");
    expect(forecast.lat).toBeCloseTo(29.7604, 2);
    expect(forecast.lon).toBeCloseTo(-95.3698, 2);
    expect(forecast.condition).toContain("unavailable");
  });
});
