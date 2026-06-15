import path from "node:path";
import { upsertNationalMatchProcessMetrics } from "@/lib/data/match-process-metrics";
import { internationalMatchTierWeight } from "@/lib/world-cup/international-strength";
import { buildWcMatchSummary } from "@/lib/world-cup/match-summary";
import type { OptaParsedMatch } from "@/lib/world-cup/opta-html-parser";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import { resolveWcMatchFromParsedTeams } from "@/lib/world-cup/resolve-wc-match";
import { assertOptaHtmlBundle } from "@/lib/world-cup/wc-opta-results-dir";
import { clearWcCalibrationCache, loadWcCalibrationConfig } from "@/lib/world-cup/wc-calibration-config";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OptaIngestResult = {
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
  return -Math.abs(hash || 1) - 9_000_000;
}

async function findIngestedMatchIdForFile(
  supabase: SupabaseClient,
  filePath: string
): Promise<string | null> {
  const { data } = await supabase
    .from("world_cup_post_match_ingests")
    .select("match_id")
    .eq("source_path", filePath)
    .limit(1);
  return data?.[0]?.match_id ?? null;
}

export async function ingestOptaMatchFile(
  supabase: SupabaseClient,
  filePath: string,
  options?: { skipIfIngested?: boolean }
): Promise<OptaIngestResult> {
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

  const resolved = await resolveWcMatchFromParsedTeams(supabase, {
    homeTeamApiId: parsed.homeTeamApiId,
    awayTeamApiId: parsed.awayTeamApiId,
    matchDate: parsed.matchDate,
  });

  if (!resolved) {
    throw new Error(
      `No WC match found for ${parsed.homeTeamName} vs ${parsed.awayTeamName} on ${parsed.matchDate}`
    );
  }

  const matchId = resolved.matchId;

  if (options?.skipIfIngested) {
    const { data: existing } = await supabase
      .from("world_cup_post_match_ingests")
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

  const matchSummary = buildWcMatchSummary(parsed);

  const { error: matchErr } = await supabase
    .from("matches")
    .update({
      home_goals: parsed.homeGoals,
      away_goals: parsed.awayGoals,
      status: "finished",
      home_formation: parsed.homeFormation,
      away_formation: parsed.awayFormation,
      referee: parsed.referee,
      attendance: parsed.attendance,
      venue: parsed.venue ?? undefined,
    })
    .eq("id", matchId);

  if (matchErr) throw new Error(matchErr.message);

  await upsertNationalMatchProcessMetrics(supabase, {
    event_id: optaSyntheticEventId(matchId),
    source: "opta_html",
    match_date: parsed.matchDate,
    home_team_id: parsed.homeTeamApiId,
    away_team_id: parsed.awayTeamApiId,
    home_xg: parsed.homeXg,
    away_xg: parsed.awayXg,
    home_shots: parsed.homeShots,
    away_shots: parsed.awayShots,
    home_sot: parsed.homeShotsOnTarget,
    away_sot: parsed.awayShotsOnTarget,
    competition_tier: internationalMatchTierWeight("FIFA World Cup 2026"),
    payload: {
      venue: parsed.venue,
      narrative: parsed.narrativeFeatures,
      opta_facts_count: parsed.optaFacts.length,
    },
  });

  const homeTeamDbId = resolved.match.home_team_id;
  const awayTeamDbId = resolved.match.away_team_id;
  if (homeTeamDbId) {
    await supabase.from("world_cup_team_discipline").upsert({
      team_id: homeTeamDbId,
      yellow_cards: parsed.narrativeFeatures.yellowCardsHome,
      direct_red_cards: parsed.narrativeFeatures.redCardsHome,
      indirect_red_cards: 0,
      updated_at: new Date().toISOString(),
    });
  }
  if (awayTeamDbId) {
    await supabase.from("world_cup_team_discipline").upsert({
      team_id: awayTeamDbId,
      yellow_cards: parsed.narrativeFeatures.yellowCardsAway,
      direct_red_cards: parsed.narrativeFeatures.redCardsAway,
      indirect_red_cards: 0,
      updated_at: new Date().toISOString(),
    });
  }

  await supabase.from("world_cup_post_match_ingests").insert({
    match_id: matchId,
    source_path: filePath,
    parsed: {
      homeTeamName: parsed.homeTeamName,
      awayTeamName: parsed.awayTeamName,
      homeGoals: parsed.homeGoals,
      awayGoals: parsed.awayGoals,
      homeXg: parsed.homeXg,
      awayXg: parsed.awayXg,
      matchDate: parsed.matchDate,
      warnings: parsed.warnings,
      matchSummary,
    },
    article_text: parsed.articleText,
    narrative_features: parsed.narrativeFeatures,
  });

  if (parsed.narrativeFeatures.setPieceGoalRateMentioned != null && parsed.awayTeamApiId) {
    const cal = await loadWcCalibrationConfig();
    const teamSetPieceRates = {
      ...cal.teamSetPieceRates,
      [String(parsed.awayTeamApiId)]: parsed.narrativeFeatures.setPieceGoalRateMentioned,
    };
    await supabase.from("world_cup_calibration_config").insert({
      version: `${cal.modelVersion}-ingest-sp`,
      constants: { ...cal, teamSetPieceRates, modelVersion: cal.modelVersion },
      metrics: { source: "opta_ingest", match_id: matchId },
    });
    clearWcCalibrationCache();
  }

  return { filePath, matchId, parsed };
}

export async function ingestOptaMatchFiles(
  supabase: SupabaseClient,
  files: string[]
): Promise<OptaIngestResult[]> {
  const results: OptaIngestResult[] = [];
  for (const file of files) {
    results.push(
      await ingestOptaMatchFile(supabase, file, { skipIfIngested: true })
    );
  }
  return results;
}

export function formatIngestResultLine(result: OptaIngestResult): string {
  if (result.skipped) {
    return `${path.basename(result.filePath)} — skipped (${result.skipReason})`;
  }
  const p = result.parsed;
  return `${p.homeTeamName} ${p.homeGoals}-${p.awayGoals} ${p.awayTeamName} (${result.matchId})`;
}
