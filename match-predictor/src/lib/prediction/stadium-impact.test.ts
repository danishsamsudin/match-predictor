import { describe, expect, it } from "vitest";
import {
  HOME_CITY_XG_MULTIPLIER,
  computeStadiumImpact,
} from "@/lib/prediction/stadium-impact";

describe("computeStadiumImpact", () => {
  const breda = { lat: 51.5719, lon: 4.7683 };
  const amsterdam = { lat: 52.3676, lon: 4.9041 };

  it("boosts home-side xG when match city matches the home team's city (compare / neutral)", () => {
    const result = computeStadiumImpact(
      "Rat Verlegh Stadion",
      breda,
      { city: "Breda", homeLocation: breda },
      { city: "Amsterdam", homeLocation: amsterdam },
      { isNeutralVenue: true, matchCity: "Breda" }
    );

    expect(result.homeXgMultiplier).toBe(HOME_CITY_XG_MULTIPLIER);
    expect(result.awayXgMultiplier).toBe(1);
    expect(result.notes.some((n) => n.includes("home-city"))).toBe(true);
  });

  it("boosts away-side xG when match city matches the away team's city", () => {
    const result = computeStadiumImpact(
      "Johan Cruyff Arena",
      amsterdam,
      { city: "Breda", homeLocation: breda },
      { city: "Amsterdam", homeLocation: amsterdam },
      { isNeutralVenue: true, matchCity: "Amsterdam" }
    );

    expect(result.homeXgMultiplier).toBe(1);
    expect(result.awayXgMultiplier).toBe(HOME_CITY_XG_MULTIPLIER);
  });

  it("does not apply home-city boost on standard home fixtures", () => {
    const result = computeStadiumImpact(
      "Emirates Stadium",
      { lat: 51.555, lon: -0.108 },
      { city: "London", homeLocation: { lat: 51.555, lon: -0.108 } },
      { city: "Liverpool", homeLocation: { lat: 53.4084, lon: -2.9916 } },
      { isNeutralVenue: false, matchCity: "London" }
    );

    expect(result.homeXgMultiplier).toBe(1);
  });
});
