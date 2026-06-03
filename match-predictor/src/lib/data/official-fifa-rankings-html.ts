import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadOfficialFifaRankingsRows } from "@/lib/data/official-fifa-rankings-snapshot";
import { parseFifaOfficialRankingHtml } from "@/lib/data/parse-fifa-official-ranking-html";
import type { SofascoreFifaRankingRow } from "@/lib/data/parse-sofascore-fifa-html";
import { parseSofascoreFifaRankingsHtml } from "@/lib/data/parse-sofascore-fifa-html";
import {
  buildSofascoreTeamIdLookup,
  resolveSofascoreTeamId,
} from "@/lib/data/resolve-fifa-sofascore-team-id";

/** Official FIFA/Coca-Cola men's ranking page (inside.fifa.com). */
export const OFFICIAL_FIFA_RANKINGS_HTML_PATH = join(
  process.cwd(),
  "data/imports/fbref/world-cup/FIFA_Coca-Cola Men's World Ranking.html"
);

const LEGACY_SOFA_HTML_PATH = join(
  process.cwd(),
  "data/imports/fbref/world-cup/FIFA Football Rankings 2026 - Sofascore.html"
);

function enrichWithSofascoreIds(
  rows: ReturnType<typeof parseFifaOfficialRankingHtml>
): SofascoreFifaRankingRow[] {
  const idByNorm = new Map<string, number>();
  if (existsSync(LEGACY_SOFA_HTML_PATH)) {
    const sofaRows = parseSofascoreFifaRankingsHtml(
      readFileSync(LEGACY_SOFA_HTML_PATH, "utf-8")
    );
    for (const row of sofaRows) {
      if (row.sofascoreTeamId != null) {
        idByNorm.set(row.normalizedTeamName, row.sofascoreTeamId);
      }
    }
  }
  const lookup = buildSofascoreTeamIdLookup(idByNorm);

  return rows.map((row) => ({
    rankingYear: row.rankingYear,
    semester: row.semester,
    rank: row.rank,
    teamName: row.teamName,
    normalizedTeamName: row.normalizedTeamName,
    totalPoints: row.totalPoints,
    previousPoints: row.previousPoints,
    pointsDiff: row.pointsDiff,
    acronym: row.acronym,
    sofascoreTeamId: resolveSofascoreTeamId(row.teamName, lookup),
    dataSource: "fifa" as const,
  }));
}

/** Latest official ranks: bundled JSON in production; parse HTML when regenerating locally. */
export function readOfficialFifaRankingsHtmlRows(): SofascoreFifaRankingRow[] {
  const bundled = loadOfficialFifaRankingsRows();
  if (bundled.length > 0) return bundled;

  if (!existsSync(OFFICIAL_FIFA_RANKINGS_HTML_PATH)) {
    return [];
  }
  const html = readFileSync(OFFICIAL_FIFA_RANKINGS_HTML_PATH, "utf-8");
  return enrichWithSofascoreIds(parseFifaOfficialRankingHtml(html));
}
