import { describe, expect, it } from "vitest";
import { parseNlPlayerStatsFixtureFromFilename } from "./nl-player-stats-dir";

describe("parseNlPlayerStatsFixtureFromFilename", () => {
  it("parses Opta Betting Showcase names that use Sept", () => {
    const meta = parseNlPlayerStatsFixtureFromFilename(
      "Netherlands vs Germany - 24 Sept 2026 - UEFA Nations League 2026_2027 - Betting Showcase.html"
    );
    expect(meta).not.toBeNull();
    expect(meta!.homeName).toBe("Netherlands");
    expect(meta!.awayName).toBe("Germany");
    expect(meta!.matchDate).toBe("2026-09-24");
  });

  it("parses Sep and September month forms", () => {
    expect(
      parseNlPlayerStatsFixtureFromFilename(
        "Andorra vs Malta - 24 Sep 2026 - UEFA Nations League.html"
      )?.matchDate
    ).toBe("2026-09-24");
    expect(
      parseNlPlayerStatsFixtureFromFilename(
        "Andorra vs Malta - 24 September 2026 - UEFA Nations League.html"
      )?.matchDate
    ).toBe("2026-09-24");
  });
});
