import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import type { OptaParsedMatch } from "@/lib/world-cup/opta-html-parser";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import { candidateWcMatchDates } from "@/lib/world-cup/resolve-wc-match";
import { listWcOptaResultHtmlFiles } from "@/lib/world-cup/wc-opta-results-dir";

function teamPairKey(home: string, away: string): string {
  const teams = [normalizeNationalTeamName(home), normalizeNationalTeamName(away)].sort();
  return `${teams[0]}|${teams[1]}`;
}

let parsedByDateAndPair: Map<string, OptaParsedMatch> | null = null;

function loadOptaParseIndex(): Map<string, OptaParsedMatch> {
  if (parsedByDateAndPair) return parsedByDateAndPair;

  const index = new Map<string, OptaParsedMatch>();
  for (const file of listWcOptaResultHtmlFiles()) {
    try {
      const parsed = parseOptaMatchFromFile(file);
      if (!parsed.homeTeamName || !parsed.awayTeamName) continue;
      const pair = teamPairKey(parsed.homeTeamName, parsed.awayTeamName);
      const date = parsed.matchDate?.slice(0, 10) ?? "";
      if (date) index.set(`${date}|${pair}`, parsed);
      if (!index.has(`|${pair}`)) index.set(`|${pair}`, parsed);
    } catch {
      /* skip unreadable bundles */
    }
  }

  parsedByDateAndPair = index;
  return index;
}

/** Clear in-memory index (tests). */
export function clearOptaParseIndexCache(): void {
  parsedByDateAndPair = null;
}

/** Resolve committed Opta Analyst HTML for a fixture by team pair (+ date when known). */
export function findOptaParsedMatch(input: {
  date?: string | null;
  homeName: string;
  awayName: string;
}): OptaParsedMatch | null {
  const index = loadOptaParseIndex();
  const pair = teamPairKey(input.homeName, input.awayName);

  if (input.date) {
    for (const candidate of candidateWcMatchDates(input.date)) {
      const hit = index.get(`${candidate.slice(0, 10)}|${pair}`);
      if (hit) return hit;
    }
  }

  return index.get(`|${pair}`) ?? null;
}
