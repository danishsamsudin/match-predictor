import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/utils/geo";
import { resolveCityCoordinates } from "@/lib/utils/geo";
import { getNationalTeamBaseCity } from "@/lib/data/national-team-geography";
import { getFifaStrengthMultiplier } from "./fifa-team-strength";
import { getTeamCity } from "@/lib/data/football-reference";

describe("national team travel bases", () => {
  it("uses distinct capitals for Sweden and Netherlands", () => {
    expect(getNationalTeamBaseCity(4688, "Sweden")).toBe("Stockholm");
    expect(getNationalTeamBaseCity(4705, "Netherlands")).toBe("Amsterdam");
    expect(getTeamCity(4688, { entityType: "national", teamName: "Sweden" })).toBe(
      "Stockholm"
    );
    expect(getTeamCity(4705, { entityType: "national", teamName: "Netherlands" })).toBe(
      "Amsterdam"
    );
  });

  it("computes different travel distances to Houston", () => {
    const houston = resolveCityCoordinates("Houston")!;
    const stockholm = resolveCityCoordinates("Stockholm")!;
    const amsterdam = resolveCityCoordinates("Amsterdam")!;

    const swedenKm = haversineKm(
      stockholm.lat,
      stockholm.lon,
      houston.lat,
      houston.lon
    );
    const netherlandsKm = haversineKm(
      amsterdam.lat,
      amsterdam.lon,
      houston.lat,
      houston.lon
    );

    expect(swedenKm).toBeGreaterThan(7000);
    expect(netherlandsKm).toBeGreaterThan(7000);
    expect(Math.abs(swedenKm - netherlandsKm)).toBeGreaterThan(200);
  });
});

describe("getFifaStrengthMultiplier", () => {
  it("rates Netherlands above Sweden vs top FIFA side", () => {
    const sweden = getFifaStrengthMultiplier(4688, "Sweden");
    const netherlands = getFifaStrengthMultiplier(4705, "Netherlands");
    expect(netherlands).toBeGreaterThan(sweden);
    expect(netherlands).toBeLessThanOrEqual(1);
    expect(sweden).toBeLessThan(1);
  });

  it("rates the top FIFA side at 1.0 (static fallback or DB)", () => {
    const argentina = getFifaStrengthMultiplier(4819, "Argentina");
    const france = getFifaStrengthMultiplier(4481, "France");
    expect(Math.max(argentina, france)).toBe(1);
  });
});
