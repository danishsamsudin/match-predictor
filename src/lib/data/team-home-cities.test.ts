import { describe, expect, it } from "vitest";
import { getClubHomeCity } from "@/lib/data/team-home-cities";
import { TEAM_CITY_BY_ID } from "@/lib/data/team-cities.generated";
import { TEAM_LOGO_ID_TO_NAME } from "@/lib/data/team-logo-manifest";

describe("getClubHomeCity", () => {
  it("covers every team in the logo manifest", () => {
    for (const id of Object.keys(TEAM_LOGO_ID_TO_NAME).map(Number)) {
      expect(TEAM_CITY_BY_ID[id], `missing city for team ${id}`).toBeTruthy();
      expect(getClubHomeCity(id), `getClubHomeCity failed for ${id}`).toBeTruthy();
    }
  });

  it("returns Breda for NAC Breda", () => {
    expect(getClubHomeCity(2947, "NAC Breda")).toBe("Breda");
  });

  it("returns Amsterdam for Ajax", () => {
    expect(getClubHomeCity(2953, "AFC Ajax")).toBe("Amsterdam");
  });
});
