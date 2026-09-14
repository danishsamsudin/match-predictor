import { describe, expect, it } from "vitest";
import { sportmonksNextCursorToken } from "./client";

describe("sportmonksNextCursorToken", () => {
  it("passes through a raw cursor token", () => {
    expect(sportmonksNextCursorToken("WzEsNTAs")).toBe("WzEsNTAs");
  });

  it("extracts cursor from a next_cursor URL", () => {
    const url =
      "https://api.sportmonks.com/v3/football/fixtures/between/2026-09-13/2026-09-21?filters=fixtureLeagues:8&cursor=WzEsNTAsWyIyMDI2Il0&per_page=50";
    expect(sportmonksNextCursorToken(url)).toBe("WzEsNTAsWyIyMDI2Il0");
  });
});
