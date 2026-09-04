import { describe, expect, it } from "vitest";
import { leagueMetaFromPayload } from "./league-meta";

describe("leagueMetaFromPayload", () => {
  it("keeps known GLPM league names", () => {
    expect(leagueMetaFromPayload(8, { league: { name: "Other" } }).name).toBe("Premier League");
  });

  it("falls back to payload.league for unknown competitions", () => {
    expect(leagueMetaFromPayload(2, { league: { name: "Champions League" } })).toEqual({
      name: "Champions League",
      countryName: "",
      countryIso: "",
    });
  });
});
