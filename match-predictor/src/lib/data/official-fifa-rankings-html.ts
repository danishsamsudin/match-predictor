import { loadOfficialFifaRankingsRows } from "@/lib/data/official-fifa-rankings-snapshot";
import type { SofascoreFifaRankingRow } from "@/lib/data/parse-sofascore-fifa-html";

/** Latest official FIFA ranks (bundled JSON). Regenerate via `npm run fifa:generate-json`. */
export function readOfficialFifaRankingsHtmlRows(): SofascoreFifaRankingRow[] {
  return loadOfficialFifaRankingsRows();
}
