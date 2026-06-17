import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSofascoreFifaRankingsHtml } from "@/lib/data/parse-sofascore-fifa-html";

const SOFASCORE_HTML = join(
  process.cwd(),
  "data/imports/fbref/world-cup/FIFA Football Rankings 2026 - Sofascore.html"
);

describe("parseSofascoreFifaRankingsHtml", () => {
  it("parses ranking rows from saved Sofascore page", () => {
    const html = readFileSync(SOFASCORE_HTML, "utf-8");
    const rows = parseSofascoreFifaRankingsHtml(html);
    expect(rows.length).toBeGreaterThan(200);
    const france = rows.find((r) => r.teamName === "France");
    expect(france?.rank).toBe(1);
    expect(france?.totalPoints).toBeGreaterThan(1800);
    expect(france?.sofascoreTeamId).toBe(4481);
    expect(france?.rankingYear).toBe(2026);
    const capeVerde = rows.find((r) => r.normalizedTeamName === "cabo verde");
    expect(capeVerde?.rank).toBeGreaterThan(0);

    const mexico = rows.find((r) => r.teamName === "Mexico");
    expect(mexico?.rank).toBe(15);
    expect(mexico?.sofascoreTeamId).toBe(4781);

    const morocco = rows.find((r) => r.teamName === "Morocco");
    expect(morocco?.rank).toBe(8);
  });
});
