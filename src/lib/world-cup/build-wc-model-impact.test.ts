import { describe, expect, it } from "vitest";
import { buildWcGrahamModelImpact } from "@/lib/world-cup/build-wc-model-impact";

describe("buildWcGrahamModelImpact", () => {
  it("returns five factor rows from snapshot multipliers", () => {
    const rows = buildWcGrahamModelImpact({
      gamma_home: 1.007,
      gamma_away: 0.971,
      host_nation_boost: 1.05,
      delta_final_home: 1,
      delta_final_away: 0.96,
      weather_home_xg_mult: 0.98,
      weather_away_xg_mult: 0.92,
      lineup_home_xg_mult: 1.03,
      lineup_away_xg_mult: 0.97,
    });

    expect(rows.map((r) => r.label)).toEqual([
      "Altitude acclimation",
      "Host nation",
      "Travel & jet lag",
      "Weather",
      "Lineup",
    ]);
    expect(rows[0].homeMultiplier).toBeCloseTo(1.007);
    expect(rows[1].homeMultiplier).toBe(1.05);
    expect(rows[3].awayMultiplier).toBe(0.92);
  });

  it("defaults missing keys to neutral 1.0", () => {
    const rows = buildWcGrahamModelImpact({});
    expect(rows.every((r) => r.homeMultiplier === 1 && r.awayMultiplier === 1)).toBe(true);
  });

  it("attaches kickoff forecast metadata on the weather row", () => {
    const rows = buildWcGrahamModelImpact({
      weather_condition: "Clear sky",
      weather_code: 0,
      weather_temp_c: 24,
    });
    const weather = rows.find((r) => r.label === "Weather");
    expect(weather?.forecast).toEqual({
      condition: "Clear sky",
      weatherCode: 0,
      tempC: 24,
    });
  });
});
