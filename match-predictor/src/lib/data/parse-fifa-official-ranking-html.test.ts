import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseFifaOfficialRankingHtml } from "@/lib/data/parse-fifa-official-ranking-html";

const FIFA_HTML = join(
  process.cwd(),
  "data/imports/fbref/world-cup/FIFA_Coca-Cola Men's World Ranking.html"
);

describe("parseFifaOfficialRankingHtml", () => {
  it("parses 211 teams from FIFA/Coca-Cola saved page", () => {
    const html = readFileSync(FIFA_HTML, "utf-8");
    const rows = parseFifaOfficialRankingHtml(html);
    expect(rows.length).toBe(211);

    const mexico = rows.find((r) => r.teamName === "Mexico");
    expect(mexico?.rank).toBe(15);
    expect(mexico?.totalPoints).toBeCloseTo(1684.13, 2);
    expect(mexico?.acronym).toBe("MEX");

    const netherlands = rows.find((r) => r.teamName === "Netherlands");
    const sweden = rows.find((r) => r.teamName === "Sweden");
    expect(netherlands!.rank).toBeLessThan(sweden!.rank);
    expect(rows[0].rankingYear).toBe(2026);
    expect(rows[0].semester).toBe(1);
  });
});
