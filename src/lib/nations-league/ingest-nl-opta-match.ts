import path from "node:path";
import { upsertNationalMatchProcessMetrics } from "@/lib/data/match-process-metrics";
import { NL_COMPETITION_LABEL } from "@/lib/nations-league/group-draw";
import { loadNlCalibrationConfig } from "@/lib/nations-league/nl-calibration-config";
import { assertOptaHtmlBundle } from "@/lib/nations-league/nl-opta-results-dir";
import { resolveNlMatchFromParsedTeams } from "@/lib/nations-league/resolve-nl-match";
import { internationalMatchTierWeight } from "@/lib/world-cup/international-strength";
import {
  mapGoalsBetweenOrientations,
  swapOptaParsedMatch,
} from "@/lib/world-cup/match-orientation";
import { buildWcMatchSummary } from "@/lib/world-cup/match-summary";
import type { OptaParsedMatch } from "@/lib/world-cup/opta-html-parser";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NlOptaIngestResult = {
  filePath: string;
  matchId: string;
  parsed: OptaParsedMatch;
  skipped?: boolean;
  skipReason?: string;
};

function optaSyntheticEventId(matchId: string): number {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash * 31 + matchId.charCodeAt(i)) | 0;
  }
  return -Math.abs(hash || 1) - 8_000_000;
}

async function findIngestedMatchIdForFile(
  supabase: SupabaseClient,
  filePath: string
): Promise<string | null> {
  const { data } = await supabase
    .from("nations_league_post_match_ingests")
    .select("match_id")
    .eq("source_path", filePath)
    .limit(1);
  return data?.[0]?.match_id ?? null;
}

/**
 * Parse Opta Analyst HTML with shared WC parsers, then upsert NL tables:
 * matches (competition ILIKE %Nations League%), national_match_process_metrics,
 * nations_league_post_match_ingests.
 *
 * Remaining mapping (not yet wired vs WC):
 * - No nations_league_team_discipline table (skipped)
 * - Hub Model-XI / tournament form composites land via player-stats ingest
 */
export async function ingestNlOptaMatchFile(
  supabase: SupabaseClient,
  filePath: string,
  options?: { skipIfIngested?: boolean }
): Promise<NlOptaIngestResult> {
  if (options?.skipIfIngested) {
    const byPath = await findIngestedMatchIdForFile(supabase, filePath);
    if (byPath) {
      return {
        filePath,
        matchId: byPath,
        parsed: {
          homeTeamName: path.basename(filePath),
          awayTeamName: "",
          homeTeamApiId: null,
          awayTeamApiId: null,
          homeGoals: 0,
          awayGoals: 0,
          halfTimeHome: null,
          halfTimeAway: null,
          matchDate: null,
          venue: null,
          attendance: null,
          referee: null,
          homeFormation: null,
          awayFormation: null,
          homeXg: null,
          awayXg: null,
          homeShots: null,
          awayShots: null,
          homeShotsOnTarget: null,
          awayShotsOnTarget: null,
          homeCorners: null,
          awayCorners: null,
          homeFoulsConceded: null,
          awayFoulsConceded: null,
          widgetStats: null,
          articleText: "",
          optaFacts: [],
          narrativeFeatures: {
            setPieceGoal: false,
            setPieceGoalRateMentioned: null,
            redCardsHome: 0,
            redCardsAway: 0,
            yellowCardsHome: 0,
            yellowCardsAway: 0,
            comebackWin: false,
            dominantPossessionSide: null,
            possessionHomePct: null,
            possessionAwayPct: null,
          },
          warnings: [],
          sourcePath: filePath,
        },
        skipped: true,
        skipReason: "already_ingested",
      };
    }
  }

  assertOptaHtmlBundle(filePath);
  const parsed = parseOptaMatchFromFile(filePath);
  if (!parsed.homeTeamApiId || !parsed.awayTeamApiId) {
    throw new Error(`Could not resolve teams in ${filePath}`);
  }

  const resolved = await resolveNlMatchFromParsedTeams(supabase, {
    homeTeamApiId: parsed.homeTeamApiId,
    awayTeamApiId: parsed.awayTeamApiId,
    matchDate: parsed.matchDate,
  });

  if (!resolved) {
    throw new Error(
      `No Nations League match found for ${parsed.homeTeamName} vs ${parsed.awayTeamName} on ${parsed.matchDate}`
    );
  }

  const matchId = resolved.matchId;
  const orientedParsed = resolved.teamsSwappedInInput
    ? swapOptaParsedMatch(parsed)
    : parsed;

  const dbHomeName = resolved.match.home_team_name ?? orientedParsed.homeTeamName;
  const dbAwayName = resolved.match.away_team_name ?? orientedParsed.awayTeamName;
  const dbGoals = mapGoalsBetweenOrientations(
    orientedParsed.homeGoals,
    orientedParsed.awayGoals,
    orientedParsed.homeTeamName,
    orientedParsed.awayTeamName,
    dbHomeName,
    dbAwayName
  );

  if (options?.skipIfIngested) {
    const { data: existing } = await supabase
      .from("nations_league_post_match_ingests")
      .select("id")
      .eq("match_id", matchId)
      .limit(1);
    if (existing?.length) {
      return {
        filePath,
        matchId,
        parsed,
        skipped: true,
        skipReason: "already_ingested",
      };
    }
  }

  const matchSummary = buildWcMatchSummary(orientedParsed);

  const { error: matchErr } = await supabase
    .from("matches")
    .update({
      home_goals: dbGoals.homeGoals,
      away_goals: dbGoals.awayGoals,
      status: "finished",
      home_formation: orientedParsed.homeFormation,
      away_formation: orientedParsed.awayFormation,
      referee: orientedParsed.referee,
      attendance: orientedParsed.attendance,
      venue: orientedParsed.venue ?? undefined,
    })
    .eq("id", matchId)
    .ilike("competition", "%Nations League%");

  if (matchErr) throw new Error(matchErr.message);

  const homeApiId = resolveApiTeamId(
    resolved.match.home_team_id ?? "",
    dbHomeName
  );
  const awayApiId = resolveApiTeamId(
    resolved.match.away_team_id ?? "",
    dbAwayName
  );
  const metricsXg = mapGoalsBetweenOrientations(
    orientedParsed.homeXg,
    orientedParsed.awayXg,
    orientedParsed.homeTeamName,
    orientedParsed.awayTeamName,
    dbHomeName,
    dbAwayName
  );
  const metricsShots = mapGoalsBetweenOrientations(
    orientedParsed.homeShots,
    orientedParsed.awayShots,
    orientedParsed.homeTeamName,
    orientedParsed.awayTeamName,
    dbHomeName,
    dbAwayName
  );
  const metricsSot = mapGoalsBetweenOrientations(
    orientedParsed.homeShotsOnTarget,
    orientedParsed.awayShotsOnTarget,
    orientedParsed.homeTeamName,
    orientedParsed.awayTeamName,
    dbHomeName,
    dbAwayName
  );

  await upsertNationalMatchProcessMetrics(supabase, {
    event_id: optaSyntheticEventId(matchId),
    source: "opta_html",
    match_date: orientedParsed.matchDate,
    home_team_id: homeApiId || orientedParsed.homeTeamApiId,
    away_team_id: awayApiId || orientedParsed.awayTeamApiId,
    home_xg: metricsXg.homeGoals,
    away_xg: metricsXg.awayGoals,
    home_shots: metricsShots.homeGoals,
    away_shots: metricsShots.awayGoals,
    home_sot: metricsSot.homeGoals,
    away_sot: metricsSot.awayGoals,
    competition_tier: internationalMatchTierWeight(NL_COMPETITION_LABEL),
    payload: {
      venue: orientedParsed.venue,
      narrative: orientedParsed.narrativeFeatures,
      opta_facts_count: orientedParsed.optaFacts.length,
      competition: NL_COMPETITION_LABEL,
    },
  });

  await supabase.from("nations_league_post_match_ingests").insert({
    match_id: matchId,
    source_path: filePath,
    parsed: {
      homeTeamName: orientedParsed.homeTeamName,
      awayTeamName: orientedParsed.awayTeamName,
      homeGoals: orientedParsed.homeGoals,
      awayGoals: orientedParsed.awayGoals,
      homeXg: orientedParsed.homeXg,
      awayXg: orientedParsed.awayXg,
      matchDate: orientedParsed.matchDate,
      warnings: parsed.warnings,
      matchSummary,
      widgetStats: orientedParsed.widgetStats,
    },
    article_text: parsed.articleText,
    narrative_features: orientedParsed.narrativeFeatures,
  });

  if (
    orientedParsed.narrativeFeatures.setPieceGoalRateMentioned != null &&
    awayApiId
  ) {
    const cal = await loadNlCalibrationConfig();
    const teamSetPieceRates = {
      ...cal.teamSetPieceRates,
      [String(awayApiId)]:
        orientedParsed.narrativeFeatures.setPieceGoalRateMentioned,
    };
    await supabase.from("nations_league_calibration_config").insert({
      version: `${cal.modelVersion}-ingest-sp`,
      constants: { ...cal, teamSetPieceRates, modelVersion: cal.modelVersion },
      metrics: { source: "opta_ingest", match_id: matchId },
    });
  }

  return { filePath, matchId, parsed: orientedParsed };
}

export async function ingestNlOptaMatchFiles(
  supabase: SupabaseClient,
  files: string[]
): Promise<NlOptaIngestResult[]> {
  const results: NlOptaIngestResult[] = [];
  for (const file of files) {
    results.push(
      await ingestNlOptaMatchFile(supabase, file, { skipIfIngested: true })
    );
  }
  return results;
}

export function formatNlIngestResultLine(result: NlOptaIngestResult): string {
  if (result.skipped) {
    return `${path.basename(result.filePath)} - skipped (${result.skipReason})`;
  }
  const p = result.parsed;
  return `${p.homeTeamName} ${p.homeGoals}-${p.awayGoals} ${p.awayTeamName} (${result.matchId})`;
}
