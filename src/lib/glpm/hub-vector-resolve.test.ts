import { describe, expect, it } from "vitest";
import {
  buildCompetitionMeanVector,
  predictionSourceFromResolved,
  resolveHubTeamVector,
} from "@/lib/glpm/hub-vector-resolve";
import type { LoadedRatingVector } from "@/lib/glpm/load-vectors";
import { PRIMARY_ORDER, type PrimaryKey } from "@/lib/glpm/engine";
import { extractVenueLocation } from "@/lib/glpm/hub-weather";
import { fairOddsFromProb, hubPredictionFromHistoryRow } from "@/lib/glpm/hub-prediction-map";

function fakeVector(
  teamSmId: number,
  ratings: Partial<Record<PrimaryKey, number>> = {}
): LoadedRatingVector {
  const base = {} as Record<PrimaryKey, number>;
  for (const k of PRIMARY_ORDER) base[k] = ratings[k] ?? 60;
  return {
    teamSmId,
    seasonId: 1,
    asOfDate: "2026-05-01",
    ratings: base,
    metadata: {},
    modelVersion: "test",
    teamName: null,
  };
}

describe("hub-vector-resolve", () => {
  it("prefers season vector over any-season and prior", () => {
    const season = new Map([[10, fakeVector(10, { attack: 80 })]]);
    const any = new Map([[10, fakeVector(10, { attack: 50 })]]);
    const mean = buildCompetitionMeanVector([fakeVector(1, { attack: 40 })], {
      teamSmId: 0,
      seasonId: 1,
    });
    const resolved = resolveHubTeamVector(10, season, any, mean);
    expect(resolved?.isPrior).toBe(false);
    expect(resolved?.vector.ratings.attack).toBe(80);
  });

  it("falls back to any-season then competition mean prior", () => {
    const season = new Map<number, LoadedRatingVector>();
    const any = new Map([[20, fakeVector(20, { attack: 70 })]]);
    const mean = buildCompetitionMeanVector([fakeVector(1, { attack: 40 })], {
      teamSmId: 0,
      seasonId: 1,
    });

    expect(resolveHubTeamVector(20, season, any, mean)?.vector.ratings.attack).toBe(70);

    const prior = resolveHubTeamVector(99, season, any, mean);
    expect(prior?.isPrior).toBe(true);
    expect(prior?.vector.ratings.attack).toBe(40);
    expect(prior?.vector.teamSmId).toBe(99);
  });

  it("returns null when no vectors and no competition mean", () => {
    expect(
      resolveHubTeamVector(1, new Map(), new Map(), null)
    ).toBeNull();
  });

  it("marks prediction source prior when either side uses mean", () => {
    const real = { vector: fakeVector(1), isPrior: false };
    const prior = { vector: fakeVector(2), isPrior: true };
    expect(predictionSourceFromResolved(real, prior, false)).toBe("prior");
    expect(predictionSourceFromResolved(real, real, true)).toBe("stored");
    expect(predictionSourceFromResolved(real, real, false)).toBe("live");
  });
});

describe("hub-weather extractVenueLocation", () => {
  it("reads city and coords from Sportmonks venue payload", () => {
    const loc = extractVenueLocation({
      venue: {
        name: "Emirates Stadium",
        city_name: "London",
        latitude: "51.556667",
        longitude: "-0.106111",
      },
    });
    expect(loc.cityName).toBe("London");
    expect(loc.latitude).toBeCloseTo(51.556667);
    expect(loc.longitude).toBeCloseTo(-0.106111);
  });
});

describe("hub-weather horizon / TBC", () => {
  it("marks far-future kickoffs outside the forecast horizon", async () => {
    const { isWithinForecastHorizon, tbcWeather } = await import(
      "@/lib/glpm/hub-weather"
    );
    const now = Date.parse("2026-07-22T12:00:00Z");
    expect(isWithinForecastHorizon("2026-07-30T15:00:00Z", 16, now)).toBe(true);
    expect(isWithinForecastHorizon("2026-08-21T19:00:00Z", 16, now)).toBe(false);
    const tbc = tbcWeather({
      cityName: "London",
      venueName: "Emirates Stadium",
      latitude: 51.55,
      longitude: -0.1,
    });
    expect(tbc.status).toBe("tbc");
    expect(tbc.tempC).toBeNull();
    expect(tbc.condition).toBe("TBC");
    expect(tbc.cityName).toBe("London");
  });
});

describe("venue location overrides", () => {
  it("includes researched Euroborg / Hitachi Capital Mobility Stadium coords", async () => {
    const { GLPM_VENUE_LOCATION_OVERRIDES } = await import(
      "@/lib/glpm/venue-location-overrides"
    );
    const euroborg = GLPM_VENUE_LOCATION_OVERRIDES[338881];
    expect(euroborg?.latitude).toBeCloseTo(53.20611, 4);
    expect(euroborg?.longitude).toBeCloseTo(6.59139, 4);
    expect(euroborg?.cityName).toBe("Groningen");
  });
});

describe("hub-prediction-map", () => {
  it("maps history over_under 2.5 and btts", () => {
    const p = hubPredictionFromHistoryRow({
      home_win_pct: 0.5,
      draw_pct: 0.25,
      away_win_pct: 0.25,
      home_xg: 1.4,
      away_xg: 1.1,
      btts_yes_pct: 0.55,
      over_under: { "2.5": { over: 0.48, under: 0.52 } },
    });
    expect(p.over25).toBeCloseTo(0.48);
    expect(p.bttsYes).toBeCloseTo(0.55);
    expect(fairOddsFromProb(0.5)).toBe(2);
  });
});
