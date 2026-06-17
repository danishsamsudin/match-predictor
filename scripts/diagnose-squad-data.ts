/**
 * Diagnose squad comparison data availability.
 * Usage: npx tsx scripts/diagnose-squad-data.ts [homeTeamId] [awayTeamId]
 */
import fs from "fs";
import path from "path";
import { inferUsualSquadFromLineups } from "../src/lib/data/infer-usual-squad-from-lineups";
import { loadTeamSquadForComparison } from "../src/lib/data/load-team-squad-for-comparison";
import { createServiceClient, hasServiceRoleKey } from "../src/lib/supabase";

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
  console.log("SUPABASE_SERVICE_ROLE_KEY:", hasServiceRoleKey() ? "set" : "MISSING");
  console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING");

  const supabase = createServiceClient();

  const tables = [
    "synced_event_lineups",
    "synced_events",
    "scoutlyst_player_snapshots",
    "soccerdata_players",
    "synced_player_ratings",
    "synced_teams",
  ] as const;

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    console.log(`${table}:`, error ? `ERROR ${error.message}` : count ?? 0);
  }

  const { data: sampleLineup } = await supabase
    .from("synced_event_lineups")
    .select("event_id, payload, synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sampleLineup?.payload) {
    const payload = sampleLineup.payload as {
      home?: { players?: unknown[] };
      away?: { players?: unknown[] };
    };
    const homeCount = payload.home?.players?.length ?? 0;
    const awayCount = payload.away?.players?.length ?? 0;
    console.log("\nLatest lineup sample:", {
      event_id: sampleLineup.event_id,
      homePlayers: homeCount,
      awayPlayers: awayCount,
    });
  }

  const { data: scoutSample } = await supabase
    .from("scoutlyst_player_snapshots")
    .select("reference_team_id, player_name, snapshot_date")
    .not("reference_team_id", "is", null)
    .limit(3);
  console.log("\nScoutlyst sample rows:", scoutSample);

  const homeId = Number(process.argv[2]) || 42;
  const awayId = Number(process.argv[3]) || 49;
  console.log(`\n--- Squad inference for team ${homeId} vs ${awayId} ---`);

  for (const [label, teamId] of [
    ["home", homeId],
    ["away", awayId],
  ] as const) {
    const inferred = await inferUsualSquadFromLineups(supabase, teamId);
    const squad = await loadTeamSquadForComparison(supabase, teamId);
    console.log(`\n${label} (${teamId}):`, {
      inferredStarters: inferred.starters.length,
      inferredSubs: inferred.substitutes.length,
      squadStarters: squad.starters.length,
      squadSubs: squad.substitutes.length,
      squadSource: squad.squadSource,
      hasLineupData: squad.hasLineupData,
      hasScoutlystData: squad.hasScoutlystData,
      firstStarter: squad.starters[0]?.name ?? null,
    });
  }

  const { data: eventsForHome } = await supabase
    .from("synced_events")
    .select("payload, kickoff_at")
    .order("kickoff_at", { ascending: false })
    .limit(50);

  let finishedInvolving42 = 0;
  for (const row of eventsForHome ?? []) {
    const ev = row.payload as { homeTeam?: { id: number }; awayTeam?: { id: number }; status?: { type: string } };
    if (ev?.status?.type !== "finished" && ev?.status?.type !== "ended") continue;
    if (ev.homeTeam?.id === homeId || ev.awayTeam?.id === homeId) finishedInvolving42++;
  }
  console.log(`\nFinished synced_events involving team ${homeId} (in last 50 events):`, finishedInvolving42);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
