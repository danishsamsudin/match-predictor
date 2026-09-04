import { describe, expect, it } from "vitest";
import {
  GLPM_BAYESIAN_MATCH_CONFIDENCE_N,
  pickStatsSeasonId,
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
