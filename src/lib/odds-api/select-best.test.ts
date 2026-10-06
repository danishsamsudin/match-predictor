import { describe, expect, it } from "vitest";
import { preferBestPrice, mapEventToValueRows } from "@/lib/odds-api/select-best";
import { findMatchingEvent, teamNameSimilarity } from "@/lib/odds-api/match-teams";
import type { OddsApiEvent } from "@/lib/odds-api/types";

describe("preferBestPrice", () => {
  it("prefers Pinnacle when Unibet is shorter or equal", () => {
    expect(preferBestPrice(2.1, 2.0)).toEqual({
      price: 2.1,
      source: "pinnacle",
      unibetPreferred: false,
    });
    expect(preferBestPrice(2.1, 2.1)).toEqual({
      price: 2.1,
      source: "pinnacle",
      unibetPreferred: false,
    });
  });

  it("uses Unibet only when strictly longer", () => {
    expect(preferBestPrice(2.05, 2.2)).toEqual({
      price: 2.2,
      source: "unibet",
      unibetPreferred: true,
    });
  });

  it("falls back when one book is missing", () => {
    expect(preferBestPrice(null, 1.95)?.source).toBe("unibet");
    expect(preferBestPrice(1.95, null)?.source).toBe("pinnacle");
    expect(preferBestPrice(null, null)).toBeNull();
  });
});

describe("teamNameSimilarity", () => {
  it("matches common club name variants", () => {
    expect(teamNameSimilarity("Ajax", "AFC Ajax")).toBeGreaterThan(0.8);
    expect(teamNameSimilarity("Bayern Munich", "FC Bayern München")).toBeGreaterThan(0.5);
  });
});

describe("findMatchingEvent", () => {
  it("picks the correct home/away fixture", () => {
    const events = [
      {
        home_team: "Liverpool",
        away_team: "Chelsea",
        commence_time: "2026-10-10T14:00:00Z",
      },
      {
        home_team: "Arsenal",
        away_team: "Tottenham Hotspur",
        commence_time: "2026-10-10T16:30:00Z",
      },
    ];
    const hit = findMatchingEvent(events, "Arsenal FC", "Tottenham", "2026-10-10T16:30:00Z");
    expect(hit?.event.home_team).toBe("Arsenal");
  });
});

describe("mapEventToValueRows", () => {
  it("maps 1X2 and prefers Unibet when longer", () => {
    const event: OddsApiEvent = {
      id: "abc",
      sport_key: "soccer_epl",
      commence_time: "2026-10-10T14:00:00Z",
      home_team: "Home FC",
      away_team: "Away FC",
      bookmakers: [
        {
          key: "pinnacle",
          title: "Pinnacle",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Home FC", price: 2.0 },
                { name: "Draw", price: 3.4 },
                { name: "Away FC", price: 3.8 },
              ],
            },
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: 1.9, point: 2.5 },
                { name: "Under", price: 1.95, point: 2.5 },
              ],
            },
          ],
        },
        {
          key: "unibet_nl",
          title: "Unibet",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Home FC", price: 2.15 },
                { name: "Draw", price: 3.3 },
                { name: "Away FC", price: 3.7 },
              ],
            },
            {
              key: "btts",
              outcomes: [
                { name: "Yes", price: 1.8 },
                { name: "No", price: 2.05 },
              ],
            },
          ],
        },
      ],
    };

    const rows = mapEventToValueRows(event);
    const byId = Object.fromEntries(rows.map((r) => [r.rowId, r]));

    expect(byId["1x2-home"]?.source).toBe("unibet");
    expect(byId["1x2-home"]?.price).toBe(2.15);
    expect(byId["1x2-draw"]?.source).toBe("pinnacle");
    expect(byId["1x2-away"]?.source).toBe("pinnacle");
    expect(byId["ou-over-2.5"]?.price).toBe(1.9);
    expect(byId["btts-yes"]?.source).toBe("unibet");
  });
});
