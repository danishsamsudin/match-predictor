import { describe, expect, it } from "vitest";
import {
  alignGoalsToFixture,
  alignRecentMatchDisplay,
  alignWcMatchSummaryToFixture,
  namesNeedHomeAwaySwap,
  swapOptaParsedMatch,
  swapWcMatchSummary,
} from "@/lib/world-cup/match-orientation";
import type { WcMatchSummary } from "@/lib/world-cup/match-summary";

const summary: WcMatchSummary = {
  homeGoals: 7,
  awayGoals: 1,
  halfTimeHome: 4,
  halfTimeAway: 0,
  homeXg: 2.5,
  awayXg: 0.3,
  venue: "NRG Stadium",
  referee: "Ref",
  homeFormation: "4-2-3-1",
  awayFormation: "5-4-1",
  stats: [
    { key: "possession", label: "Possession", home: 70, away: 30, isPercent: true },
    { key: "shots", label: "Shots", home: 18, away: 4 },
  ],
};

describe("match orientation", () => {
  it("detects reversed home/away by team name", () => {
    expect(
      namesNeedHomeAwaySwap("Curaçao", "Germany", "Germany", "Curaçao")
    ).toBe(true);
    expect(
      namesNeedHomeAwaySwap("Germany", "Curaçao", "Germany", "Curaçao")
    ).toBe(false);
    expect(
      namesNeedHomeAwaySwap("Germany", "Curaçao", "Curacao", "Germany")
    ).toBe(true);
  });

  it("swaps summary scores and stats", () => {
    const swapped = swapWcMatchSummary(summary);
    expect(swapped.homeGoals).toBe(1);
    expect(swapped.awayGoals).toBe(7);
    expect(swapped.stats[0]?.home).toBe(30);
    expect(swapped.stats[0]?.away).toBe(70);
  });

  it("aligns summary to fixture orientation", () => {
    const aligned = alignWcMatchSummaryToFixture(
      summary,
      "Curaçao",
      "Germany",
      "Germany",
      "Curaçao"
    );
    expect(aligned.homeGoals).toBe(1);
    expect(aligned.awayGoals).toBe(7);
  });

  it("aligns goal columns for reversed ingest", () => {
    const aligned = alignGoalsToFixture(7, 1, "Curaçao", "Germany", "Germany", "Curaçao");
    expect(aligned).toEqual({ homeGoals: 1, awayGoals: 7 });
  });

  it("aligns recent display to official schedule when DB home/away is reversed", () => {
    const aligned = alignRecentMatchDisplay({
      date: "2026-06-14",
      homeTeamName: "Curaçao",
      awayTeamName: "Germany",
      homeGoals: 7,
      awayGoals: 1,
      summary: {
        homeGoals: 7,
        awayGoals: 1,
        halfTimeHome: null,
        halfTimeAway: null,
        homeXg: 2.5,
        awayXg: 0.3,
        venue: null,
        referee: null,
        homeFormation: null,
        awayFormation: null,
        stats: [],
      },
      ingestSourceHome: "Germany",
      ingestSourceAway: "Curaçao",
      ingestSourceHomeGoals: 7,
      ingestSourceAwayGoals: 1,
    });
    expect(aligned.homeTeamName).toBe("Germany");
    expect(aligned.awayTeamName).toBe("Curaçao");
    expect(aligned.homeGoals).toBe(7);
    expect(aligned.awayGoals).toBe(1);
  });

  it("aligns USA v Paraguay when DB lists Paraguay first with inverted goals", () => {
    const aligned = alignRecentMatchDisplay({
      date: "2026-06-12",
      homeTeamName: "Paraguay",
      awayTeamName: "United States",
      homeGoals: 4,
      awayGoals: 1,
      summary: null,
      ingestSourceHome: "United States",
      ingestSourceAway: "Paraguay",
      ingestSourceHomeGoals: 4,
      ingestSourceAwayGoals: 1,
    });
    expect(aligned.homeTeamName).toBe("United States");
    expect(aligned.awayTeamName).toBe("Paraguay");
    expect(aligned.homeGoals).toBe(4);
    expect(aligned.awayGoals).toBe(1);
  });

  it("aligns from committed Opta HTML when ingest metadata is missing", () => {
    const aligned = alignRecentMatchDisplay({
      date: "2026-06-14",
      homeTeamName: "Curaçao",
      awayTeamName: "Germany",
      homeGoals: 7,
      awayGoals: 1,
      summary: {
        homeGoals: 7,
        awayGoals: 1,
        halfTimeHome: null,
        halfTimeAway: null,
        homeXg: 2,
        awayXg: 0.3,
        venue: null,
        referee: null,
        homeFormation: null,
        awayFormation: null,
        stats: [],
      },
    });
    expect(aligned.homeTeamName).toBe("Germany");
    expect(aligned.awayTeamName).toBe("Curaçao");
    expect(aligned.homeGoals).toBe(7);
    expect(aligned.awayGoals).toBe(1);
  });

  it("swaps goal columns when orienting to official fixture without Opta scores", () => {
    const aligned = alignRecentMatchDisplay({
      date: "2026-06-25",
      homeTeamName: "Côte d'Ivoire",
      awayTeamName: "Curaçao",
      homeGoals: 2,
      awayGoals: 0,
      summary: null,
    });
    expect(aligned.homeTeamName).toBe("Curaçao");
    expect(aligned.awayTeamName).toBe("Côte d'Ivoire");
    expect(aligned.homeGoals).toBe(0);
    expect(aligned.awayGoals).toBe(2);
  });

  it("swaps Opta parsed match fields", () => {
    const swapped = swapOptaParsedMatch({
      homeTeamName: "Germany",
      awayTeamName: "Curaçao",
      homeTeamApiId: 4711,
      awayTeamApiId: 55827,
      homeGoals: 7,
      awayGoals: 1,
      halfTimeHome: 4,
      halfTimeAway: 0,
      matchDate: "2026-06-14",
      venue: null,
      attendance: null,
      referee: null,
      homeFormation: "4-2-3-1",
      awayFormation: "5-4-1",
      homeXg: 2.5,
      awayXg: 0.3,
      homeShots: 18,
      awayShots: 4,
      homeShotsOnTarget: 10,
      awayShotsOnTarget: 2,
      homeCorners: 6,
      awayCorners: 1,
      homeFoulsConceded: 8,
      awayFoulsConceded: 12,
      widgetStats: null,
      articleText: "",
      optaFacts: [],
      narrativeFeatures: {
        setPieceGoal: false,
        setPieceGoalRateMentioned: null,
        redCardsHome: 0,
        redCardsAway: 1,
        yellowCardsHome: 2,
        yellowCardsAway: 3,
        comebackWin: false,
        dominantPossessionSide: "home",
        possessionHomePct: 70,
        possessionAwayPct: 30,
      },
      warnings: [],
      sourcePath: null,
    });
    expect(swapped.homeTeamName).toBe("Curaçao");
    expect(swapped.awayTeamName).toBe("Germany");
    expect(swapped.homeGoals).toBe(1);
    expect(swapped.awayGoals).toBe(7);
    expect(swapped.narrativeFeatures.yellowCardsHome).toBe(3);
    expect(swapped.narrativeFeatures.possessionHomePct).toBe(30);
  });
});
