/**
 * Ingest post-match Opta Analyst HTML into WC tables.
 *
 * Usage: npx tsx scripts/wc-ingest-opta-html.ts /path/to/article.html [...]
 */
import { upsertNationalMatchProcessMetrics } from "../src/lib/data/match-process-metrics";
import { assertOptaHtmlBundle } from "../src/lib/world-cup/wc-opta-results-dir";
import { internationalMatchTierWeight } from "../src/lib/world-cup/international-strength";
import { parseOptaMatchFromFile } from "../src/lib/world-cup/opta-html-parser";
import { clearWcCalibrationCache, loadWcCalibrationConfig } from "../src/lib/world-cup/wc-calibration-config";
import { resolveWcMatchFromParsedTeams } from "../src/lib/world-cup/resolve-wc-match";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function optaSyntheticEventId(matchId: string): number {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash * 31 + matchId.charCodeAt(i)) | 0;
  }
  return -Math.abs(hash || 1) - 9_000_000;
}

async function ingestOne(
  supabase: NonNullable<ReturnType<typeof tryCreateServiceClient>>,
  filePath: string
): Promise<void> {
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

  console.log(`\nIngested ${parsed.homeTeamName} ${parsed.homeGoals}-${parsed.awayGoals} ${parsed.awayTeamName}`);
  console.log(`  match_id: ${matchId}`);
  console.log(`  xG: ${parsed.homeXg ?? "?"} - ${parsed.awayXg ?? "?"}`);
  if (parsed.warnings.length) {
    console.log(`  warnings: ${parsed.warnings.join("; ")}`);
  }
}

async function main() {
  loadEnvLocal();
  const files = process.argv
    .slice(2)
    .map((f) => f.trim())
    .filter((f) => f && !f.startsWith("-"));
  if (!files.length) {
    console.error("Usage: npx tsx scripts/wc-ingest-opta-html.ts <file.html> [...]");
    process.exit(1);
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  for (const file of files) {
    await ingestOne(supabase, file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
