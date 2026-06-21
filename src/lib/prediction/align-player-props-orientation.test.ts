import { describe, expect, it } from "vitest";
import {
  alignPlayerPropsToLabels,
  shouldOrientWcCompareToRequest,
  swapPlayerPropsPayload,
} from "@/lib/prediction/align-player-props-orientation";
import type { PlayerPropsPayload } from "@/lib/prediction/player-props";
import type { ResolvedWcMatch } from "@/lib/world-cup/resolve-wc-match";
import { swapHubPredictionRow } from "@/lib/world-cup/swap-hub-prediction-orientation";

function samplePayload(
  homeTeamName: string,
  awayTeamName: string
): PlayerPropsPayload {
  return {
    computedAt: "2026-06-21T00:00:00.000Z",
    modelVersion: "v2.1",
    warnings: [],
    home: {
      teamName: homeTeamName,
      teamId: homeTeamName === "Argentina" ? 4819 : 4718,
      teamExpectedGoals: 1.5,
      anytimeScorer: [
        {
          rank: 1,
          playerName: homeTeamName === "Argentina" ? "L. Messi" : "M. Gregoritsch",
          position: "FWD",
          fieldPosition: "RW",
          expectedGoals: 0.5,
          expectedAssists: 0.2,
          probabilityPct: 20,
          fairDecimalOdds: 5,
          isPenaltyTaker: false,
          tacticalMultiplier: 1,
        },
      ],
      goalOrAssist: [],
    },
    away: {
      teamName: awayTeamName,
      teamId: awayTeamName === "Argentina" ? 4819 : 4718,
      teamExpectedGoals: 0.8,
      anytimeScorer: [
        {
          rank: 1,
          playerName: awayTeamName === "Argentina" ? "L. Messi" : "M. Gregoritsch",
          position: "FWD",
          fieldPosition: "ST",
          expectedGoals: 0.3,
          expectedAssists: 0.1,
          probabilityPct: 12,
          fairDecimalOdds: 8,
          isPenaltyTaker: false,
          tacticalMultiplier: 1,
        },
      ],
      goalOrAssist: [],
    },
  };
}

describe("alignPlayerPropsToLabels", () => {
  it("swaps payload sides when team names are reversed vs labels", () => {
    const payload = samplePayload("Argentina", "Austria");
    const aligned = alignPlayerPropsToLabels(payload, "Austria", "Argentina");
    expect(aligned.home.teamName).toBe("Austria");
    expect(aligned.away.teamName).toBe("Argentina");
    expect(aligned.home.anytimeScorer[0]?.playerName).toBe("M. Gregoritsch");
  });

  it("keeps payload when already aligned", () => {
    const payload = samplePayload("Argentina", "Austria");
    const aligned = alignPlayerPropsToLabels(payload, "Argentina", "Austria");
    expect(aligned).toBe(payload);
  });
});

describe("shouldOrientWcCompareToRequest", () => {
  const resolved = {
    teamsSwappedInInput: true,
  } as ResolvedWcMatch;

  it("is true for compare mode when fixture orientation differs", () => {
    expect(shouldOrientWcCompareToRequest({ mode: "compare" }, resolved)).toBe(true);
  });

  it("is false for fixture mode even when swapped flag is set", () => {
    expect(shouldOrientWcCompareToRequest({ mode: "fixture" }, resolved)).toBe(false);
  });
});

describe("swapHubPredictionRow", () => {
  it("swaps win probabilities and xG snapshot fields", () => {
    const swapped = swapHubPredictionRow({
      home_win_pct: 0.6,
      draw_pct: 0.2,
      away_win_pct: 0.2,
      predicted_score_home: 2,
      predicted_score_away: 1,
      under_2_5_pct: 0.3,
      over_2_5_pct: 0.7,
      model_version: "graham",
      snapshot: { home_xg: 1.8, away_xg: 1.1, lambda: 1.8, mu: 1.1 },
    });

    expect(swapped.home_win_pct).toBe(0.2);
    expect(swapped.away_win_pct).toBe(0.6);
    expect(swapped.snapshot.home_xg).toBe(1.1);
    expect(swapped.snapshot.away_xg).toBe(1.8);
  });
});

describe("swapPlayerPropsPayload", () => {
  it("exchanges home and away sides", () => {
    const payload = samplePayload("Argentina", "Austria");
    const swapped = swapPlayerPropsPayload(payload);
    expect(swapped.home.teamName).toBe("Austria");
    expect(swapped.away.teamName).toBe("Argentina");
  });
});
