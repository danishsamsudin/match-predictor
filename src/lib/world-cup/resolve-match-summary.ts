import fs from "node:fs";
import path from "node:path";
import {
  buildWcMatchSummary,
  type WcMatchSummary,
} from "@/lib/world-cup/match-summary";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import { alignOptaParsedMatchToFixture, swapOptaParsedMatch } from "@/lib/world-cup/match-orientation";
import { resolveOfficialFixtureTeams } from "@/lib/world-cup/fixture-venues";
import { resolveWcMatchFromParsedTeams } from "@/lib/world-cup/resolve-wc-match";
import type { SupabaseClient } from "@supabase/supabase-js";

function summaryStatCount(summary: WcMatchSummary): number {
  return summary.stats.filter((s) => s.home != null || s.away != null).length;
}

/** Re-parse a locally saved Opta article when DB ingest predates full matchSummary storage. */
export async function resolveMatchSummaryFromHtml(
  supabase: SupabaseClient,
  matchId: string,
  ingestedSourcePath: string | null | undefined,
  existing: WcMatchSummary | null
): Promise<WcMatchSummary | null> {
  if (existing && summaryStatCount(existing) >= 4) return existing;

  if (!ingestedSourcePath || !fs.existsSync(ingestedSourcePath)) {
    return existing;
  }

  try {
    const parsed = parseOptaMatchFromFile(ingestedSourcePath);
    if (!parsed.homeTeamApiId || !parsed.awayTeamApiId) return existing;
    const resolved = await resolveWcMatchFromParsedTeams(supabase, {
      homeTeamApiId: parsed.homeTeamApiId,
      awayTeamApiId: parsed.awayTeamApiId,
      matchDate: parsed.matchDate,
    });
    if (!resolved || resolved.matchId !== matchId) return existing;
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
    /* fall through */
  }

  return existing;
}
