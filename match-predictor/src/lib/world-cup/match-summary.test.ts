import { describe, expect, it } from "vitest";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import {
  buildWcMatchSummary,
  enrichSummaryFromNarrative,
  parseWcMatchSummaryFromIngest,
} from "@/lib/world-cup/match-summary";
import path from "node:path";

const FIXTURE = path.join(
  __dirname,
  "__fixtures__/opta-html/mexico-south-africa.html"
);

describe("match summary", () => {
  it("builds TV-style stats from Opta parse", () => {
    const parsed = parseOptaMatchFromFile(FIXTURE);
    const summary = buildWcMatchSummary(parsed);
    expect(summary.homeGoals).toBe(2);
    expect(summary.awayGoals).toBe(0);
    expect(summary.stats.some((s) => s.key === "possession")).toBe(true);
    expect(summary.stats.some((s) => s.key === "xg")).toBe(true);
  });

  it("parses legacy ingest payload without matchSummary", () => {
    const summary = parseWcMatchSummaryFromIngest({
      homeGoals: 4,
      awayGoals: 1,
      homeXg: 1.34,
      awayXg: 0.47,
    });
    expect(summary?.homeGoals).toBe(4);
    expect(summary?.stats).toHaveLength(1);
  });

  it("enriches summary with narrative possession and cards", () => {
    const base = parseWcMatchSummaryFromIngest({
      homeGoals: 2,
      awayGoals: 0,
      homeXg: 1.5,
      awayXg: 0.1,
    })!;
    const enriched = enrichSummaryFromNarrative(base, {
      possessionHomePct: 62,
      possessionAwayPct: 38,
      yellowCardsHome: 2,
      yellowCardsAway: 3,
    });
    expect(enriched.stats.some((s) => s.key === "possession")).toBe(true);
    expect(enriched.stats.some((s) => s.key === "yellow")).toBe(true);
  });
});
