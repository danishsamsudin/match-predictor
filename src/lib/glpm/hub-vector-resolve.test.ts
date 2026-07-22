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
import { CROSS_LEAGUE_REMAP_MODEL } from "@/lib/glpm/league-strength";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";

function fakeVector(
  teamSmId: number,
  ratings: Partial<Record<PrimaryKey, number>> = {},
  seasonId = 1
): LoadedRatingVector {
  const base = {} as Record<PrimaryKey, number>;
  for (const k of PRIMARY_ORDER) base[k] = ratings[k] ?? 60;
  return {
    teamSmId,
    seasonId,
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

  it("remaps Championship any-season vectors into Premier League fixtures", () => {
    const season = new Map<number, LoadedRatingVector>();
    const championshipSeasonId = 25648;
    const plSeasonId = 28083;
    const any = new Map([
      [19, fakeVector(19, { attack: 92, defence: 90 }, championshipSeasonId)],
    ]);
    const mean = buildCompetitionMeanVector(
      [fakeVector(1, { attack: 60, defence: 60 }, plSeasonId)],
      { teamSmId: 0, seasonId: plSeasonId }
    );
    const seasonCompetitionBySeasonId = new Map([
      [championshipSeasonId, SM_LEAGUE.CHAMPIONSHIP],
      [plSeasonId, SM_LEAGUE.PREMIER_LEAGUE],
    ]);

    const resolved = resolveHubTeamVector(19, season, any, mean, {
      targetCompetitionId: SM_LEAGUE.PREMIER_LEAGUE,
      seasonCompetitionBySeasonId,
      destinationAnchor: 60,
      targetSeasonId: plSeasonId,
    });

    expect(resolved?.isPrior).toBe(true);
    expect(resolved?.vector.modelVersion).toBe(CROSS_LEAGUE_REMAP_MODEL);
    expect(resolved?.vector.seasonId).toBe(plSeasonId);
    expect(resolved!.vector.ratings.attack).toBeLessThan(60);
    expect(resolved!.vector.ratings.attack).toBeLessThan(92);
  });

  it("passes through same-competition any-season vectors unchanged", () => {
    const season = new Map<number, LoadedRatingVector>();
    const priorPlSeason = 25583;
    const plSeasonId = 28083;
    const any = new Map([[
      19,
      fakeVector(19, { attack: 88 }, priorPlSeason),
    ]]);
    const seasonCompetitionBySeasonId = new Map([
      [priorPlSeason, SM_LEAGUE.PREMIER_LEAGUE],
      [plSeasonId, SM_LEAGUE.PREMIER_LEAGUE],
    ]);

    const resolved = resolveHubTeamVector(19, season, any, null, {
      targetCompetitionId: SM_LEAGUE.PREMIER_LEAGUE,
      seasonCompetitionBySeasonId,
      targetSeasonId: plSeasonId,
    });

    expect(resolved?.isPrior).toBe(false);
    expect(resolved?.vector.ratings.attack).toBe(88);
    expect(resolved?.vector.modelVersion).toBe("test");
  });

  it("returns null when no vectors and no competition mean", () => {
    expect(
      resolveHubTeamVector(1, new Map(), new Map(), null)
    ).toBeNull();
  });

  it("uses promotion prior for newcomers without any-season vectors", () => {
    const season = new Map<number, LoadedRatingVector>();
    const any = new Map<number, LoadedRatingVector>();
    const mean = buildCompetitionMeanVector(
      [fakeVector(1, { attack: 60, defence: 60 }, 27958)],
      { teamSmId: 0, seasonId: 27958 }
    );
    const resolved = resolveHubTeamVector(1128, season, any, mean, {
      targetCompetitionId: SM_LEAGUE.EREDIVISIE,
      seasonCompetitionBySeasonId: new Map([[27958, SM_LEAGUE.EREDIVISIE]]),
      destinationAnchor: 60,
      targetSeasonId: 27958,
      promotedTeamIds: new Set([1128]),
    });
    expect(resolved?.isPrior).toBe(true);
    expect(resolved?.vector.modelVersion).toBe("glpm_promotion_prior_v1");
    expect(resolved?.vector.ratings.attack).toBe(48);
    expect(resolved?.vector.teamSmId).toBe(1128);
  });

  it("does not use promotion prior when competition mean applies to non-promoted sides", () => {
    const mean = buildCompetitionMeanVector([fakeVector(1, { attack: 60 })], {
      teamSmId: 0,
      seasonId: 1,
    });
    const resolved = resolveHubTeamVector(99, new Map(), new Map(), mean, {
      targetSeasonId: 1,
      promotedTeamIds: new Set([1128]),
    });
    expect(resolved?.vector.ratings.attack).toBe(60);
    expect(resolved?.vector.modelVersion).toBe("glpm_hub_competition_mean_v1");
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
