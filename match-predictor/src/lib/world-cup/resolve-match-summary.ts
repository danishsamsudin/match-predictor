import fs from "node:fs";
import { alignOptaParsedMatchToFixture, swapOptaParsedMatch } from "@/lib/world-cup/match-orientation";
import { resolveOfficialFixtureTeams } from "@/lib/world-cup/fixture-venues";
import {
  buildWcMatchSummary,
  type WcMatchSummary,
} from "@/lib/world-cup/match-summary";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import { resolveWcMatchFromParsedTeams } from "@/lib/world-cup/resolve-wc-match";
import { listWcOptaResultHtmlFiles } from "@/lib/world-cup/wc-opta-results-dir";
import type { SupabaseClient } from "@supabase/supabase-js";

function summaryStatCount(summary: WcMatchSummary): number {
  return summary.stats.filter((s) => s.home != null || s.away != null).length;
}

/** Re-parse committed Opta HTML when DB ingest predates full matchSummary storage. */
export async function resolveMatchSummaryFromHtml(
  supabase: SupabaseClient,
  matchId: string,
  ingestedSourcePath: string | null | undefined,
  existing: WcMatchSummary | null
): Promise<WcMatchSummary | null> {
  if (existing && summaryStatCount(existing) >= 4) return existing;

  const candidates = new Set<string>();
  if (ingestedSourcePath && fs.existsSync(ingestedSourcePath)) {
    candidates.add(ingestedSourcePath);
  }
  for (const file of listWcOptaResultHtmlFiles()) {
    candidates.add(file);
  }

  for (const file of candidates) {
    try {
      const parsed = parseOptaMatchFromFile(file);
      if (!parsed.homeTeamApiId || !parsed.awayTeamApiId) continue;
      const resolved = await resolveWcMatchFromParsedTeams(supabase, {
        homeTeamApiId: parsed.homeTeamApiId,
        awayTeamApiId: parsed.awayTeamApiId,
        matchDate: parsed.matchDate,
      });
      if (!resolved || resolved.matchId !== matchId) continue;
      const official = resolveOfficialFixtureTeams({
        date: parsed.matchDate,
        homeName: parsed.homeTeamName,
        awayName: parsed.awayTeamName,
      });
      const orientedParsed = official
        ? alignOptaParsedMatchToFixture(parsed, official.home, official.away)
        : resolved.teamsSwappedInInput
          ? swapOptaParsedMatch(parsed)
          : parsed;
      const summary = buildWcMatchSummary(orientedParsed);
      if (summaryStatCount(summary) > 0) return summary;
    } catch {
      /* try next file */
    }
  }

  return existing;
}
