/**
 * Diagnose team comparison season stats (corners, fouls, etc.).
 * Usage: npx tsx scripts/diagnose-team-season-stats.ts <teamId> <leagueId> [teamName]
 */
import fs from "fs";
import path from "path";
import { parseTeamStats } from "../src/lib/api/football";
import { mergeSeasonStats } from "../src/lib/data/load-team-comparison-data";
import { buildSeasonStatsFromBundle } from "../src/lib/data/build-team-comparison";
import { loadSeasonStatsFromDatabase } from "../src/lib/data/load-team-comparison-data";
import { aggregateTeamMetricsFromSyncedEvents } from "../src/lib/data/aggregate-team-event-metrics";
import { resolveTeamStatistics } from "../src/lib/data/resolve-team-statistics";
import { mapTeamInfo } from "../src/lib/api/sportapi/mappers";
import { getLeagueById } from "../src/lib/data/football-reference";
import { createServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const teamId = Number(process.argv[2]) || 33;
  const leagueId = Number(process.argv[3]) || 39;
  const teamName = process.argv[4] || "Tottenham Hotspur";
  const league = getLeagueById(leagueId);
  const season = league?.season ?? new Date().getFullYear();

  console.log({ teamId, leagueId, teamName, season });

  const supabase = createServiceClient();
  const fromDb = await loadSeasonStatsFromDatabase(teamId, leagueId, true, teamName);
  console.log("\nDB:", fromDb);
  const agg = await aggregateTeamMetricsFromSyncedEvents(supabase, leagueId, teamId, teamName);
  console.log("\nEvent aggregates (league-scoped):", agg);

  const aggCross = await aggregateTeamMetricsFromSyncedEvents(
    supabase,
    leagueId,
    teamId,
    teamName,
    10
  );
  console.log("\nEvent aggregates (same):", aggCross);

  const { count: plEvents } = await supabase
    .from("synced_events")
    .select("*", { count: "exact", head: true })
    .eq("reference_league_id", leagueId);
  const { count: plStats } = await supabase
    .from("synced_event_statistics")
    .select("*", { count: "exact", head: true });

  console.log("\nCounts:", { plEvents, plStats });

  const stats = await resolveTeamStatistics({
    teamId,
    leagueId,
    season,
    isHomeSide: true,
    teamName,
  });
  const parsed = parseTeamStats(stats, true);
  console.log("\nBundle parseTeamStats:", parsed);
  const fromBundle = buildSeasonStatsFromBundle(
    stats,
    true,
    mapTeamInfo(teamId, teamName, "London", "Stadium")
  );
  console.log("\nfromBundle:", fromBundle);
  console.log("\nmerged:", mergeSeasonStats(fromDb.stats, fromBundle));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
