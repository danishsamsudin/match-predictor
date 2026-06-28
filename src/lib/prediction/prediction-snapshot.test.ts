import { describe, expect, it } from "vitest";
import { pctToFraction, snapshotDateUtc, utcDayBounds } from "@/lib/prediction/snapshot-types";
import { buildLeagueSnapshotRow, buildWcSnapshotRow } from "@/lib/prediction/persist-prediction-snapshot";
import type { HubPredictionRow } from "@/lib/world-cup/hub-main-predict";

describe("snapshot-types", () => {
  it("utcDayBounds covers full UTC day", () => {
    expect(utcDayBounds("2026-08-15")).toEqual({
      start: "2026-08-15T00:00:00.000Z",
      end: "2026-08-15T23:59:59.999Z",
    });
  });

  it("pctToFraction normalizes league percentages", () => {
    expect(pctToFraction(45.2)).toBe(0.452);
    expect(pctToFraction(0.45)).toBe(0.45);
  });

  it("snapshotDateUtc uses UTC calendar date", () => {
    const d = new Date("2026-06-28T23:30:00.000Z");
    expect(snapshotDateUtc(d)).toBe("2026-06-28");
  });
});

describe("buildWcSnapshotRow", () => {
  it("maps hub prediction fractions and snapshot xG", () => {
    const pred: HubPredictionRow = {
      home_win_pct: 0.5,
      draw_pct: 0.25,
      away_win_pct: 0.25,
      predicted_score_home: 2,
      predicted_score_away: 1,
      under_2_5_pct: 0.4,
      over_2_5_pct: 0.6,
      model_version: "wc-test",
      snapshot: { home_xg: 1.8, away_xg: 1.1 },
    };
    const row = buildWcSnapshotRow({
      match: {
        id: "abc",
        date: "2026-06-28",
        time: "18:00",
        home_team_id: "h1",
        away_team_id: "a1",
        home_team_name: "Home",
        away_team_name: "Away",
        venue_city: "Mexico City",
      },
      pred,
      source: "test",
      snapshotDate: "2026-06-28",
    });
    expect(row.domain).toBe("world_cup");
    expect(row.home_win_pct).toBe(0.5);
    expect(row.home_xg).toBe(1.8);
    expect(row.match_key).toBe("abc");
  });
});

describe("buildLeagueSnapshotRow", () => {
  it("stores league probabilities as fractions", () => {
    const row = buildLeagueSnapshotRow({
      fixture: {
        id: 99,
        date: "2026-08-15T15:00:00.000Z",
        venueCity: "London",
        league: { id: 17, name: "Premier League", season: 2026 },
        home: { id: 1, name: "Arsenal" },
        away: { id: 2, name: "Chelsea" },
      },
      result: {
        homeWinPct: 40,
        drawPct: 30,
        awayWinPct: 30,
        expectedGoals: { home: 1.5, away: 1.2 },
        estimated: { corners: 10, fouls: 20, yellowCards: 4, redCards: 0.1 },
        explanation: "test",
        modelVersion: "v2.1",
      },
      source: "test",
      snapshotDate: "2026-08-15",
    });
    expect(row.domain).toBe("league");
    expect(row.home_win_pct).toBe(0.4);
    expect(row.league_id).toBe(17);
  });
});
