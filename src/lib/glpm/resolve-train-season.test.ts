import { describe, expect, it } from "vitest";
import {
  GLPM_BAYESIAN_MATCH_CONFIDENCE_N,
  pickStatsSeasonId,
  seasonUsesThinCurrentData,
  shouldWarnPromotedTeam,
} from "@/lib/glpm/resolve-train-season";

describe("pickStatsSeasonId", () => {
  it("stays on the prior season until the preferred season hits the n=20 floor", () => {
    const early = pickStatsSeasonId({
      preferredSeasonId: 28083,
      preferredFinishedCount: 8,
      fallbackSeasonId: 25583,
    });
    expect(early.seasonId).toBe(25583);
    expect(early.reason).toBe("fallback_25583");
  });

  it("switches to the current season once 20 matches are finished", () => {
    const ready = pickStatsSeasonId({
      preferredSeasonId: 28083,
      preferredFinishedCount: GLPM_BAYESIAN_MATCH_CONFIDENCE_N,
      fallbackSeasonId: 25583,
    });
    expect(ready.seasonId).toBe(28083);
    expect(ready.reason).toBe("preferred_has_finished");
  });

  it("keeps the preferred season when no fallback exists", () => {
    const none = pickStatsSeasonId({
      preferredSeasonId: 28083,
      preferredFinishedCount: 0,
      fallbackSeasonId: null,
    });
    expect(none.seasonId).toBe(28083);
    expect(none.reason).toBe("preferred_no_finished_yet");
  });
});

describe("seasonUsesThinCurrentData", () => {
  it("is thin before the Bayesian floor when a prior season exists", () => {
    expect(
      seasonUsesThinCurrentData({
        seasonId: 28083,
        priorSeasonId: 25583,
        finishedCount: 8,
      })
    ).toBe(true);
  });

  it("clears once finished matches hit the floor and vectors are not collapsed", () => {
    expect(
      seasonUsesThinCurrentData({
        seasonId: 28083,
        priorSeasonId: 25583,
        finishedCount: GLPM_BAYESIAN_MATCH_CONFIDENCE_N,
        vectorsCollapsed: false,
      })
    ).toBe(false);
  });

  it("stays thin while vectors are collapsed even after the floor", () => {
    expect(
      seasonUsesThinCurrentData({
        seasonId: 28083,
        priorSeasonId: 25583,
        finishedCount: 40,
        vectorsCollapsed: true,
      })
    ).toBe(true);
  });

  it("is not thin when viewing the prior season itself", () => {
    expect(
      seasonUsesThinCurrentData({
        seasonId: 25583,
        priorSeasonId: 25583,
        finishedCount: 0,
      })
    ).toBe(false);
  });
});

describe("shouldWarnPromotedTeam", () => {
  it("warns for promoted clubs while a distinct prior season is the fallback", () => {
    expect(
      shouldWarnPromotedTeam({
        isPromoted: true,
        priorSeasonId: 25583,
        seasonId: 28083,
        hasPriorSeasonVector: false,
      })
    ).toBe(true);
  });

  it("does not warn for established clubs", () => {
    expect(
      shouldWarnPromotedTeam({
        isPromoted: false,
        priorSeasonId: 25583,
        seasonId: 28083,
        hasPriorSeasonVector: true,
      })
    ).toBe(false);
  });

  it("does not warn once the prior fallback is no longer distinct", () => {
    expect(
      shouldWarnPromotedTeam({
        isPromoted: true,
        priorSeasonId: null,
        seasonId: 28083,
        hasPriorSeasonVector: false,
      })
    ).toBe(false);
  });
});
