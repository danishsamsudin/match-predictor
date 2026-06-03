import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  parseSofascoreFifaRankingsHtml,
  type SofascoreFifaRankingRow,
} from "@/lib/data/parse-sofascore-fifa-html";

/** Saved FIFA men's ranking page (2026 snapshot) — sole source for latest official ranks. */
export const OFFICIAL_FIFA_RANKINGS_HTML_PATH = join(
  process.cwd(),
  "data/imports/fbref/world-cup/FIFA Football Rankings 2026 - Sofascore.html"
);

export function readOfficialFifaRankingsHtmlRows(): SofascoreFifaRankingRow[] {
  if (!existsSync(OFFICIAL_FIFA_RANKINGS_HTML_PATH)) {
    return [];
  }
  const html = readFileSync(OFFICIAL_FIFA_RANKINGS_HTML_PATH, "utf-8");
  return parseSofascoreFifaRankingsHtml(html).map((row) => ({
    ...row,
    dataSource: "fifa" as const,
  }));
}
