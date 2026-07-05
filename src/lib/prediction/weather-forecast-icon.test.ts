import { describe, expect, it } from "vitest";
import {
  resolveWeatherIconKind,
  weatherIconKindFromCode,
  weatherIconKindFromCondition,
} from "@/lib/prediction/weather-forecast-icon";

describe("weather forecast icons", () => {
  it("maps WMO clear codes to sunny", () => {
    expect(weatherIconKindFromCode(0)).toBe("clear");
    expect(weatherIconKindFromCode(1)).toBe("clear");
  });

  it("maps rain and thunder codes", () => {
    expect(weatherIconKindFromCode(63)).toBe("rain");
    expect(weatherIconKindFromCode(95)).toBe("thunder");
  });

  it("falls back to condition text", () => {
    expect(weatherIconKindFromCondition("Clear sky")).toBe("clear");
    expect(weatherIconKindFromCondition("Partly cloudy")).toBe("partly-cloudy");
  });

  it("prefers weather code over condition label", () => {
    expect(
      resolveWeatherIconKind({ weatherCode: 0, condition: "Heavy rain" })
    ).toBe("clear");
  });
});
