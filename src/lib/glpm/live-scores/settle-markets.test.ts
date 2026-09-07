import { describe, expect, it } from "vitest";
import {
  countCardsFromTimeline,
  favoriteFromPrediction,
  resolveActualMatchTotals,
  settleScoreMarkets,
} from "./settle-markets";
import { emptySideMetrics } from "./map-timeline";
import type { LiveScoreTimelineEvent } from "./types";

describe("settleScoreMarkets", () => {
  it("settles 1X2, O/U 2.5, and BTTS from the score", () => {
    expect(settleScoreMarkets(2, 1)).toEqual({
      result: "H",
      over25: true,
      btts: true,
      totalGoals: 3,
    });
    expect(settleScoreMarkets(0, 0)).toEqual({
      result: "D",
      over25: false,
      btts: false,
      totalGoals: 0,
    });
    expect(settleScoreMarkets(0, 1)).toEqual({
      result: "A",
      over25: false,
      btts: false,
      totalGoals: 1,
    });
  });
});

describe("countCardsFromTimeline", () => {
  const timeline: LiveScoreTimelineEvent[] = [
    {
      id: 1,
      kind: "yellow_card",
      side: "home",
      minute: 20,
      extraMinute: null,
      clockLabel: "20'",
      playerName: "A",
      relatedPlayerName: null,
      info: null,
    },
    {
      id: 2,
      kind: "red_card",
      side: "away",
      minute: 55,
      extraMinute: null,
      clockLabel: "55'",
      playerName: "B",
      relatedPlayerName: null,
      info: null,
    },
    {
      id: 3,
      kind: "yellow_red_card",
      side: "home",
      minute: 70,
      extraMinute: null,
      clockLabel: "70'",
      playerName: "C",
      relatedPlayerName: null,
      info: null,
    },
  ];

  it("counts yellow, red, and second-yellow as both", () => {
    expect(countCardsFromTimeline(timeline, "home")).toEqual({ yellow: 2, red: 1 });
    expect(countCardsFromTimeline(timeline, "away")).toEqual({ yellow: 0, red: 1 });
  });
});

describe("resolveActualMatchTotals", () => {
  it("prefers DB stats and falls back to metrics / timeline", () => {
    const timeline: LiveScoreTimelineEvent[] = [
      {
        id: 1,
        kind: "yellow_card",
        side: "away",
        minute: 10,
        extraMinute: null,
        clockLabel: "10'",
        playerName: "X",
        relatedPlayerName: null,
        info: null,
      },
    ];
    const totals = resolveActualMatchTotals({
      homeStats: { corners: 7, yellowCards: 2, redCards: 0 },
      awayStats: null,
      homeMetrics: { ...emptySideMetrics(), corners: 4 },
      awayMetrics: { ...emptySideMetrics(), corners: 3 },
      timeline,
    });
    expect(totals.homeCorners).toBe(7);
    expect(totals.awayCorners).toBe(3);
    expect(totals.homeYellow).toBe(2);
    expect(totals.awayYellow).toBe(1);
    expect(totals.homeRed).toBe(0);
    expect(totals.awayRed).toBe(0);
  });
});

describe("favoriteFromPrediction", () => {
  it("picks the highest 1X2 probability", () => {
    expect(favoriteFromPrediction({ homeWin: 0.5, draw: 0.3, awayWin: 0.2 })).toBe("H");
    expect(favoriteFromPrediction({ homeWin: 0.2, draw: 0.45, awayWin: 0.35 })).toBe("D");
    expect(favoriteFromPrediction({ homeWin: 0.2, draw: 0.25, awayWin: 0.55 })).toBe("A");
  });
});
