import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOptaPlayerStatsFixture } from "@/lib/world-cup/opta-player-stats-parser";
import {
  listWcPlayerStatsFixtures,
  WC_PLAYER_STATS_FIXTURES_ROOT,
} from "@/lib/world-cup/wc-player-stats-dir";

describe("parseOptaPlayerStatsFixture", () => {
  it("parses Mexico vs South Africa from committed Betting Showcase HTML", () => {
    const fixtures = listWcPlayerStatsFixtures(WC_PLAYER_STATS_FIXTURES_ROOT);
    const mexico = fixtures.find(
      (f) =>
        f.homeName.includes("Mexico") &&
        f.awayName.includes("South Africa") &&
        f.matchSummary &&
        f.optaSummary &&
        f.matchDetails
    );
    expect(mexico).toBeDefined();

    const parsed = parseOptaPlayerStatsFixture(mexico!);
    expect(parsed.homeTeamName).toBe("Mexico");
    expect(parsed.awayTeamName).toBe("South Africa");
    expect(parsed.homeTeamApiId).toBe(4781);
    expect(parsed.awayTeamApiId).toBe(4736);
    expect(parsed.players.length).toBeGreaterThan(20);
    expect(parsed.warnings).not.toContain("no players parsed");

    const withMinutes = parsed.players.filter((p) => p.minutes != null && p.minutes > 0);
    expect(withMinutes.length).toBeGreaterThan(10);

    const withOptaPoints = parsed.players.filter((p) => p.optaPoints != null);
    expect(withOptaPoints.length).toBeGreaterThan(10);

    const gutierrez = parsed.players.find((p) => p.playerName.includes("Guti"));
    expect(gutierrez?.stats.cards_yellow).toBe(1);
    expect(gutierrez?.stats.opta_pts_cards_yellow).toBeDefined();

    const starter = parsed.players.find((p) => p.isStarter && p.side === "home");
    expect(starter).toBeDefined();
    expect(starter!.playerName.length).toBeGreaterThan(1);
  });

  it("merges stats across three page types", () => {
    const fixtures = listWcPlayerStatsFixtures(WC_PLAYER_STATS_FIXTURES_ROOT);
    const complete = fixtures.filter(
      (f) => f.matchSummary && f.optaSummary && f.matchDetails
    );
    expect(complete.length).toBeGreaterThan(0);

    const parsed = parseOptaPlayerStatsFixture(complete[0]);
    const hasXg = parsed.players.some(
      (p) => p.stats.expectedGoals != null || p.stats.xg != null
    );
    const hasSummaryStat = parsed.players.some(
      (p) => p.stats.goals != null || p.stats.G != null || p.stats.tackles != null
    );
    expect(hasXg || hasSummaryStat).toBe(true);
  });

  it("lists fixtures with resolved paths under __fixtures__/", () => {
    const fixtures = listWcPlayerStatsFixtures(WC_PLAYER_STATS_FIXTURES_ROOT);
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
    for (const f of fixtures) {
      if (f.matchSummary) {
        expect(f.matchSummary).toContain(
          path.join("__fixtures__", "opta-player-stats", "Match Summary")
        );
      }
    }
  });
});
